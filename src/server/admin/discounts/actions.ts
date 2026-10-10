"use server";

import { eq, inArray } from "drizzle-orm";
import { updateTag } from "next/cache";
import { z } from "zod";
import { copyCodeCandidates, generateCode } from "@/domain/discounts/code";
import { evaluateDiscount, type DiscountCartLine, type DiscountRule } from "@/domain/discounts/discount-engine";
import { discountFormToObject, parseDiscountForm, type DiscountFormData } from "@/domain/discounts/discount-form";
import { CATALOG_CACHE_TAG } from "@/server/cache-tags";
import type { Database } from "@/server/db/client";
import { getDb } from "@/server/db/client";
import { discountCodes, discountManufacturers, discountProductModels, discountSupplierListings, supplierListings, productModels } from "@/server/db/schema";
import { loadDiscountTargets, toDiscountRule, type DiscountTargets } from "@/server/discounts/discount-repository";
import { toDiscountCartLines } from "@/server/discounts/discount-service";
import { fail, ok, type ActionResult } from "../action-result";
import { diffChanges, writeAudit, type AuditChanges } from "../audit";
import { runAdminAction } from "../run-action";

/**
 * Sooduskoodide haldus. Iga toiming: admini sessioon + päritolu (runAdminAction) → serveripoolne
 * valideerimine → tehing (muudatus + audit). Kasutatud koode füüsiliselt ei kustutata (arhiveerimine).
 */

const uuid = z.uuid();
type Tx = Parameters<Parameters<Database["transaction"]>[0]>[0];

export type DiscountActionResult = ActionResult & { id?: string };

const UNIQUE_CODE_ERROR = "Selline kood on juba olemas (ka arhiveeritud koodid jäävad reserveerituks).";

function isUniqueViolation(error: unknown): boolean {
  const e = error as { code?: string; cause?: { code?: string } };
  return e?.code === "23505" || e?.cause?.code === "23505";
}

async function replaceTargets(tx: Tx, id: string, data: Pick<DiscountFormData, "manufacturers" | "productModelIds" | "listingIds" | "excludedProductModelIds" | "excludedListingIds">) {
  await tx.delete(discountManufacturers).where(eq(discountManufacturers.discountCodeId, id));
  await tx.delete(discountProductModels).where(eq(discountProductModels.discountCodeId, id));
  await tx.delete(discountSupplierListings).where(eq(discountSupplierListings.discountCodeId, id));
  if (data.manufacturers.length) await tx.insert(discountManufacturers).values(data.manufacturers.map((manufacturer) => ({ discountCodeId: id, manufacturer })));
  const models = [
    ...data.productModelIds.map((productModelId) => ({ discountCodeId: id, productModelId, mode: "INCLUDE" as const })),
    ...data.excludedProductModelIds.map((productModelId) => ({ discountCodeId: id, productModelId, mode: "EXCLUDE" as const })),
  ];
  const listings = [
    ...data.listingIds.map((supplierListingId) => ({ discountCodeId: id, supplierListingId, mode: "INCLUDE" as const })),
    ...data.excludedListingIds.map((supplierListingId) => ({ discountCodeId: id, supplierListingId, mode: "EXCLUDE" as const })),
  ];
  if (models.length) await tx.insert(discountProductModels).values(models);
  if (listings.length) await tx.insert(discountSupplierListings).values(listings);
}

/** Valitud ID-d peavad päriselt olemas olema (võltsitud ID ei jõua andmebaasi). */
async function verifyTargetIds(tx: Tx, data: DiscountFormData): Promise<string | null> {
  const modelIds = [...new Set([...data.productModelIds, ...data.excludedProductModelIds])];
  const listingIds = [...new Set([...data.listingIds, ...data.excludedListingIds])];
  if (modelIds.length) {
    const found = await tx.select({ id: productModels.id }).from(productModels).where(inArray(productModels.id, modelIds));
    if (found.length !== modelIds.length) return "Mõnda valitud mudelit ei leitud";
  }
  if (listingIds.length) {
    const found = await tx.select({ id: supplierListings.id }).from(supplierListings).where(inArray(supplierListings.id, listingIds));
    if (found.length !== listingIds.length) return "Mõnda valitud konfiguratsiooni ei leitud";
  }
  return null;
}

function columnsFrom(data: DiscountFormData) {
  return {
    code: data.code,
    normalizedCode: data.normalizedCode,
    name: data.name,
    internalDescription: data.internalDescription,
    type: data.type,
    value: data.value,
    startsAt: data.startsAt,
    expiresAt: data.expiresAt,
    minimumSubtotalCents: data.minimumSubtotalCents,
    maximumDiscountCents: data.maximumDiscountCents,
    usageLimit: data.usageLimit,
    scope: data.scope,
    respectMinimumMargin: data.respectMinimumMargin,
  };
}

const targetsForAudit = (t: Pick<DiscountTargets, "manufacturers" | "includedModelIds" | "excludedModelIds" | "includedListingIds" | "excludedListingIds">) => ({
  manufacturers: [...t.manufacturers].sort(),
  productModels: [...t.includedModelIds].sort(),
  excludedProductModels: [...t.excludedModelIds].sort(),
  listings: [...t.includedListingIds].sort(),
  excludedListings: [...t.excludedListingIds].sort(),
});

export async function createDiscountAction(_prev: DiscountActionResult | null, formData: FormData): Promise<DiscountActionResult> {
  return runAdminAction("discount.create", async (admin) => {
    const parsed = parseDiscountForm(discountFormToObject(formData));
    if (!parsed.success) return fail("Kontrolli välju", parsed.fieldErrors);
    const data = parsed.data;
    try {
      const result = await getDb().transaction(async (tx) => {
        const targetError = await verifyTargetIds(tx, data);
        if (targetError) return fail(targetError, { scope: targetError });
        const [existing] = await tx.select({ id: discountCodes.id }).from(discountCodes).where(eq(discountCodes.normalizedCode, data.normalizedCode));
        if (existing) return fail(UNIQUE_CODE_ERROR, { code: UNIQUE_CODE_ERROR });
        const [created] = await tx
          .insert(discountCodes)
          .values({ ...columnsFrom(data), status: data.status, createdBy: admin.email, updatedBy: admin.email })
          .returning();
        await replaceTargets(tx, created.id, data);
        await writeAudit(tx, admin, {
          action: "discount.create",
          entityType: "DiscountCode",
          entityId: created.id,
          entityLabel: created.code,
          changes: diffChanges({}, { ...columnsFrom(data), status: data.status, ...targetsForAudit({ manufacturers: data.manufacturers, includedModelIds: data.productModelIds, excludedModelIds: data.excludedProductModelIds, includedListingIds: data.listingIds, excludedListingIds: data.excludedListingIds }) }),
        });
        return { ...ok(`Sooduskood ${created.code} loodud.`), id: created.id };
      });
      if (result.ok) updateTag(CATALOG_CACHE_TAG);
      return result;
    } catch (error) {
      if (isUniqueViolation(error)) return fail(UNIQUE_CODE_ERROR, { code: UNIQUE_CODE_ERROR });
      throw error;
    }
  });
}

export async function updateDiscountAction(id: string, _prev: DiscountActionResult | null, formData: FormData): Promise<DiscountActionResult> {
  return runAdminAction("discount.update", async (admin) => {
    if (!uuid.safeParse(id).success) return fail("Vigane ID");
    const parsed = parseDiscountForm(discountFormToObject(formData));
    if (!parsed.success) return fail("Kontrolli välju", parsed.fieldErrors);
    const data = parsed.data;
    try {
      return await getDb().transaction(async (tx) => {
        const [current] = await tx.select().from(discountCodes).where(eq(discountCodes.id, id)).for("update");
        if (!current) return fail("Sooduskoodi ei leitud");
        if (current.status === "ARCHIVED") return fail("Arhiveeritud koodi ei saa muuta. Tee sellest duplikaat.");
        if (current.normalizedCode !== data.normalizedCode && current.usageCount > 0) {
          return fail("Kasutatud koodi teksti ei saa muuta", { code: "Kood on tellimustes kasutusel — tee uus kood või duplikaat" });
        }
        const targetError = await verifyTargetIds(tx, data);
        if (targetError) return fail(targetError, { scope: targetError });
        if (current.normalizedCode !== data.normalizedCode) {
          const [clash] = await tx.select({ id: discountCodes.id }).from(discountCodes).where(eq(discountCodes.normalizedCode, data.normalizedCode));
          if (clash) return fail(UNIQUE_CODE_ERROR, { code: UNIQUE_CODE_ERROR });
        }
        const beforeTargets = await loadDiscountTargets(tx, id);
        // Staatust vormist ei muudeta — selleks on eraldi toimingud (aktiveeri / lülita välja / arhiveeri)
        const [updated] = await tx.update(discountCodes).set({ ...columnsFrom(data), updatedBy: admin.email }).where(eq(discountCodes.id, id)).returning();
        await replaceTargets(tx, id, data);
        const changes: AuditChanges = {
          ...diffChanges(columnsFrom(current as unknown as DiscountFormData), columnsFrom(data)),
          ...diffChanges(targetsForAudit(beforeTargets), targetsForAudit({ manufacturers: data.manufacturers, includedModelIds: data.productModelIds, excludedModelIds: data.excludedProductModelIds, includedListingIds: data.listingIds, excludedListingIds: data.excludedListingIds })),
        };
        if (Object.keys(changes).length === 0) return { ...ok("Muudatusi polnud."), id };
        await writeAudit(tx, admin, { action: "discount.update", entityType: "DiscountCode", entityId: id, entityLabel: updated.code, changes });
        updateTag(CATALOG_CACHE_TAG);
        return { ...ok("Sooduskood salvestatud."), id };
      });
    } catch (error) {
      if (isUniqueViolation(error)) return fail(UNIQUE_CODE_ERROR, { code: UNIQUE_CODE_ERROR });
      throw error;
    }
  });
}

const TRANSITIONS: Record<"ACTIVE" | "DISABLED" | "ARCHIVED", { from: string[]; action: string; message: string }> = {
  ACTIVE: { from: ["DRAFT", "DISABLED"], action: "discount.activate", message: "Sooduskood aktiveeritud." },
  DISABLED: { from: ["ACTIVE"], action: "discount.disable", message: "Sooduskood välja lülitatud." },
  ARCHIVED: { from: ["DRAFT", "ACTIVE", "DISABLED"], action: "discount.archive", message: "Sooduskood arhiveeritud." },
};

export async function setDiscountStatusAction(id: string, status: "ACTIVE" | "DISABLED" | "ARCHIVED"): Promise<ActionResult> {
  return runAdminAction("discount.status", async (admin) => {
    if (!uuid.safeParse(id).success || !(status in TRANSITIONS)) return fail("Vigane päring");
    const transition = TRANSITIONS[status];
    const result = await getDb().transaction(async (tx) => {
      const [current] = await tx.select().from(discountCodes).where(eq(discountCodes.id, id)).for("update");
      if (!current) return fail("Sooduskoodi ei leitud");
      if (!transition.from.includes(current.status)) return fail(`Olekust ${current.status} ei saa minna olekusse ${status}.`);
      await tx.update(discountCodes).set({ status, updatedBy: admin.email }).where(eq(discountCodes.id, id));
      await writeAudit(tx, admin, { action: transition.action, entityType: "DiscountCode", entityId: id, entityLabel: current.code, changes: { status: { from: current.status, to: status } } });
      return ok(transition.message);
    });
    if (result.ok) updateTag(CATALOG_CACHE_TAG);
    return result;
  });
}

/** Duplikaat: uus MUSTAND uue koodiga (KOOL75 → KOOL75-COPY). Ei saa kunagi olla kohe aktiivne. */
export async function duplicateDiscountAction(id: string): Promise<DiscountActionResult> {
  return runAdminAction("discount.duplicate", async (admin) => {
    if (!uuid.safeParse(id).success) return fail("Vigane ID");
    return getDb().transaction(async (tx) => {
      const [source] = await tx.select().from(discountCodes).where(eq(discountCodes.id, id));
      if (!source) return fail("Sooduskoodi ei leitud");
      const candidates = [...copyCodeCandidates(source.code), generateCode()];
      const taken = new Set((await tx.select({ code: discountCodes.normalizedCode }).from(discountCodes).where(inArray(discountCodes.normalizedCode, candidates))).map((r) => r.code));
      const code = candidates.find((c) => !taken.has(c)) ?? generateCode();
      const targets = await loadDiscountTargets(tx, id);
      const [copy] = await tx
        .insert(discountCodes)
        .values({
          code,
          normalizedCode: code,
          name: `${source.name} (koopia)`.slice(0, 120),
          internalDescription: source.internalDescription,
          type: source.type,
          value: source.value,
          status: "DRAFT",
          startsAt: source.startsAt,
          expiresAt: source.expiresAt,
          minimumSubtotalCents: source.minimumSubtotalCents,
          maximumDiscountCents: source.maximumDiscountCents,
          usageLimit: source.usageLimit,
          scope: source.scope,
          respectMinimumMargin: source.respectMinimumMargin,
          createdBy: admin.email,
          updatedBy: admin.email,
        })
        .returning();
      await replaceTargets(tx, copy.id, {
        manufacturers: targets.manufacturers,
        productModelIds: targets.includedModelIds,
        excludedProductModelIds: targets.excludedModelIds,
        listingIds: targets.includedListingIds,
        excludedListingIds: targets.excludedListingIds,
      });
      await writeAudit(tx, admin, { action: "discount.duplicate", entityType: "DiscountCode", entityId: copy.id, entityLabel: copy.code, changes: { duplicatedFrom: { from: null, to: source.code } } });
      return { ...ok(`Loodud mustand ${copy.code}.`), id: copy.id };
    });
  });
}

// ---------------------------------------------------------------------------
// Eelvaade (sama DiscountEngine, mis ostukorvis)
// ---------------------------------------------------------------------------

export interface DiscountPreviewLine {
  label: string;
  quantity: number;
  lineTotalCents: number;
  eligible: boolean;
  discountCents: number;
  marginLimited: boolean;
  marginUnchecked: boolean;
}

export type DiscountPreviewResult =
  | {
      ok: true;
      valid: boolean;
      message: string;
      /** Kas kood kehtiks PRAEGU (olek + kuupäevad + kasutus) */
      liveValid: boolean;
      liveMessage: string;
      subtotalCents: number;
      eligibleSubtotalCents: number;
      discountCents: number;
      totalCents: number;
      lines: DiscountPreviewLine[];
      marginLimitedCount: number;
      marginUncheckedCount: number;
    }
  | { ok: false; error: string };

const previewSchema = z.object({
  subtotalEuros: z.preprocess((v) => (typeof v === "string" && v.trim() === "" ? undefined : typeof v === "string" ? v.replace(",", ".") : v), z.coerce.number().min(0).max(1_000_000).optional()),
  listings: z.array(z.object({ id: z.uuid(), quantity: z.number().int().min(1).max(10) })).max(20),
});

/**
 * Admini eelvaade: kas kood rakenduks test-summale või valitud konfiguratsioonidele.
 * Arvutus tehakse "nagu oleks kood aktiivne" (et mustandit saaks testida), lisaks näidatakse, kas kood kehtiks praegu.
 */
export async function previewDiscountAction(id: string, input: unknown): Promise<DiscountPreviewResult> {
  const auth = await runAdminAction("discount.preview", async () => ok(""));
  if (!auth.ok) return { ok: false, error: auth.error };
  if (!uuid.safeParse(id).success) return { ok: false, error: "Vigane ID" };
  const parsed = previewSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Vigane test-sisend" };
  const db = getDb();
  const [row] = await db.select().from(discountCodes).where(eq(discountCodes.id, id));
  if (!row) return { ok: false, error: "Sooduskoodi ei leitud" };
  const rule = await toDiscountRule(db, row);

  const labels: string[] = [];
  let lines: DiscountCartLine[] = [];
  if (parsed.data.listings.length) {
    const rows = await db
      .select({ listing: supplierListings, slug: productModels.slug, manufacturer: productModels.manufacturer, family: productModels.family, model: productModels.model })
      .from(supplierListings)
      .innerJoin(productModels, eq(productModels.id, supplierListings.productModelId))
      .where(inArray(supplierListings.id, parsed.data.listings.map((l) => l.id)));
    const priced = parsed.data.listings.flatMap(({ id: listingId, quantity }) => {
      const found = rows.find((r) => r.listing.id === listingId);
      if (!found || found.listing.salePriceCents === null) return [];
      labels.push(`${found.listing.sku} — ${found.family} ${found.model}`);
      return [{ sku: found.listing.sku, productSlug: found.slug, manufacturer: found.manufacturer, unitPriceCents: found.listing.salePriceCents, quantity }];
    });
    lines = await toDiscountCartLines(db, priced);
  } else if (parsed.data.subtotalEuros !== undefined) {
    // Sünteetiline rida: tootjat/mudelit pole → sobib ainult "kõik tooted" koodile; marginaali ei saa kontrollida
    labels.push("Test-summa");
    lines = [{ listing: "__TEST__", productModel: "__TEST__", manufacturer: "__TEST__", unitPriceCents: Math.round(parsed.data.subtotalEuros * 100), quantity: 1, minimumUnitPriceCents: null }];
  } else {
    return { ok: false, error: "Sisesta test-summa või vali konfiguratsioonid" };
  }

  const now = new Date();
  const hypothetical: DiscountRule = { ...rule, status: "ACTIVE", startsAt: null, expiresAt: null, usageLimit: null };
  const result = evaluateDiscount(hypothetical, lines, now);
  const live = evaluateDiscount(rule, lines, now);
  const subtotalCents = lines.reduce((sum, l) => sum + l.unitPriceCents * l.quantity, 0);
  return {
    ok: true,
    valid: result.valid,
    message: result.valid ? "Kood rakendub." : result.message,
    liveValid: live.valid,
    liveMessage: live.valid ? "Kood kehtib praegu poes." : live.message,
    subtotalCents,
    eligibleSubtotalCents: result.valid ? result.eligibleSubtotalCents : 0,
    discountCents: result.valid ? result.discountAmountCents : 0,
    totalCents: result.valid ? result.totalCents : subtotalCents,
    lines: lines.map((line, i) => {
      const allocation = result.valid ? result.allocations[i] : null;
      return {
        label: labels[i] ?? line.listing,
        quantity: line.quantity,
        lineTotalCents: line.unitPriceCents * line.quantity,
        eligible: allocation?.eligible ?? false,
        discountCents: allocation?.discountCents ?? 0,
        marginLimited: allocation?.marginLimited ?? false,
        marginUnchecked: allocation?.marginUnchecked ?? false,
      };
    }),
    marginLimitedCount: result.valid ? result.marginLimitedCount : 0,
    marginUncheckedCount: result.valid ? result.marginUncheckedCount : 0,
  };
}

"use server";

import { eq, inArray } from "drizzle-orm";
import { updateTag } from "next/cache";
import { z } from "zod";
import {
  LISTING_BULK_OPERATIONS,
  MODEL_BULK_OPERATIONS,
  bulkSchema,
  formDataToObject,
  listingEditSchema,
  modelEditSchema,
  zodFieldErrors,
} from "@/domain/admin/product-edit";
import { LISTING_OVERRIDABLE_FIELDS, MODEL_OVERRIDABLE_FIELDS, mergeOverrides } from "@/domain/catalog/overrides";
import { CATALOG_CACHE_TAG } from "@/server/cache-tags";
import { effectiveListing, effectiveModel } from "@/server/catalog/db-catalog-mapper";
import { getDb } from "@/server/db/client";
import { productModels, supplierListings } from "@/server/db/schema";
import { fail, ok, type ActionResult } from "../action-result";
import { diffChanges, writeAudit } from "../audit";
import { runAdminAction } from "../run-action";

/**
 * Toodete muutmine adminis.
 * - Tarnija väljad salvestatakse PARANDUSENA (manual_overrides) — tarnija väärtus jääb alles ja järgmine
 *   sync ei kirjuta parandust üle.
 * - Admini väljad (staatus, esiletõstmine, kirjeldus, müügihind) salvestatakse otse veergu.
 * - Iga muudatus: serveripoolne valideerimine → transaktsioon (muudatus + audit) → poe vahemälu tühjendus.
 */

const uuid = z.uuid();
const pick = <T extends Record<string, unknown>>(source: T, keys: readonly string[]) => Object.fromEntries(keys.map((key) => [key, source[key]]));

export async function updateModelAction(id: string, _prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  return runAdminAction("model.update", async (admin) => {
    if (!uuid.safeParse(id).success) return fail("Vigane mudeli ID");
    const parsed = modelEditSchema.safeParse(formDataToObject(formData, Object.keys(modelEditSchema.shape)));
    if (!parsed.success) return fail("Kontrolli välju", zodFieldErrors(parsed.error));
    const input = parsed.data;

    const result = await getDb().transaction(async (tx) => {
      const [current] = await tx.select().from(productModels).where(eq(productModels.id, id)).for("update");
      if (!current) return fail("Mudelit ei leitud");
      const overrides = mergeOverrides(current, (current.manualOverrides ?? {}) as Record<string, unknown>, pick(input, MODEL_OVERRIDABLE_FIELDS), MODEL_OVERRIDABLE_FIELDS);
      const adminColumns = { description: input.description, status: input.status, featured: input.featured };
      const [updated] = await tx.update(productModels).set({ ...adminColumns, manualOverrides: overrides }).where(eq(productModels.id, id)).returning();

      const before = effectiveModel(current);
      const after = effectiveModel(updated);
      const fields = [...MODEL_OVERRIDABLE_FIELDS, "description", "status", "featured"];
      const changes = diffChanges(pick(before, fields), pick(after, fields));
      if (Object.keys(changes).length === 0) return ok("Muudatusi polnud.");
      await writeAudit(tx, admin, { action: "model.update", entityType: "ProductModel", entityId: id, entityLabel: `${after.family} ${after.model}`, changes });
      return ok("Mudel salvestatud.");
    });
    if (result.ok) updateTag(CATALOG_CACHE_TAG);
    return result;
  });
}

export async function updateListingAction(id: string, _prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  return runAdminAction("listing.update", async (admin) => {
    if (!uuid.safeParse(id).success) return fail("Vigane konfiguratsiooni ID");
    const parsed = listingEditSchema.safeParse(formDataToObject(formData, Object.keys(listingEditSchema.shape)));
    if (!parsed.success) return fail("Kontrolli välju", zodFieldErrors(parsed.error));
    const input = parsed.data;

    const result = await getDb().transaction(async (tx) => {
      const [current] = await tx.select().from(supplierListings).where(eq(supplierListings.id, id)).for("update");
      if (!current) return fail("Konfiguratsiooni ei leitud");
      const overrides = mergeOverrides(current, (current.manualOverrides ?? {}) as Record<string, unknown>, pick(input, LISTING_OVERRIDABLE_FIELDS), LISTING_OVERRIDABLE_FIELDS);
      const [updated] = await tx
        .update(supplierListings)
        .set({ salePriceCents: input.salePriceCents, status: input.status, manualOverrides: overrides })
        .where(eq(supplierListings.id, id))
        .returning();

      const fields = [...LISTING_OVERRIDABLE_FIELDS, "salePriceCents", "status"];
      const changes = diffChanges(pick(effectiveListing(current), fields), pick(effectiveListing(updated), fields));
      if (Object.keys(changes).length === 0) return ok("Muudatusi polnud.");
      await writeAudit(tx, admin, { action: "listing.update", entityType: "SupplierListing", entityId: id, entityLabel: updated.sku, changes });
      return ok("Konfiguratsioon salvestatud.");
    });
    if (result.ok) updateTag(CATALOG_CACHE_TAG);
    return result;
  });
}

/** "Taasta tarnija väärtus": eemaldab ühe välja paranduse. */
export async function clearOverrideAction(entity: "model" | "listing", id: string, field: string): Promise<ActionResult> {
  return runAdminAction(`${entity}.clear_override`, async (admin) => {
    if (!uuid.safeParse(id).success) return fail("Vigane ID");
    const allowed: readonly string[] = entity === "model" ? MODEL_OVERRIDABLE_FIELDS : LISTING_OVERRIDABLE_FIELDS;
    if (!allowed.includes(field)) return fail("Seda välja ei saa taastada");
    const table = entity === "model" ? productModels : supplierListings;

    const result = await getDb().transaction(async (tx) => {
      const [current] = await tx.select().from(table).where(eq(table.id, id)).for("update");
      if (!current) return fail("Kirjet ei leitud");
      const overrides = { ...((current.manualOverrides ?? {}) as Record<string, unknown>) };
      if (!(field in overrides)) return ok("Parandust polnud.");
      const from = overrides[field];
      delete overrides[field];
      await tx.update(table).set({ manualOverrides: overrides }).where(eq(table.id, id));
      const label = "sku" in current ? current.sku : `${current.family} ${current.model}`;
      await writeAudit(tx, admin, {
        action: `${entity}.override_cleared`,
        entityType: entity === "model" ? "ProductModel" : "SupplierListing",
        entityId: id,
        entityLabel: label,
        changes: { [field]: { from, to: (current as Record<string, unknown>)[field] ?? null } },
      });
      return ok("Tarnija väärtus taastatud.");
    });
    if (result.ok) updateTag(CATALOG_CACHE_TAG);
    return result;
  });
}

function parseBulk<T extends readonly [string, ...string[]]>(operations: T, formData: FormData) {
  return bulkSchema(operations).safeParse({ operation: formData.get("operation"), ids: [...new Set(formData.getAll("ids").map(String))] });
}

/** Mudelite bulk-toimingud. Kustutamist pole — andmed jäävad alles ja on tagasi pööratavad. */
export async function bulkModelsAction(formData: FormData): Promise<ActionResult> {
  return runAdminAction("model.bulk", async (admin) => {
    const parsed = parseBulk(MODEL_BULK_OPERATIONS, formData);
    if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Vigane päring");
    const { operation, ids } = parsed.data;
    const set =
      operation === "activate" ? { status: "ACTIVE" as const } : operation === "hide" ? { status: "HIDDEN" as const } : { featured: operation === "feature" };

    const count = await getDb().transaction(async (tx) => {
      const rows = await tx.select().from(productModels).where(inArray(productModels.id, ids)).for("update");
      for (const row of rows) {
        const field = Object.keys(set)[0] as "status" | "featured";
        const to = (set as Record<string, unknown>)[field];
        if (row[field] === to) continue;
        await writeAudit(tx, admin, { action: `model.bulk.${operation}`, entityType: "ProductModel", entityId: row.id, entityLabel: `${row.family} ${row.model}`, changes: { [field]: { from: row[field], to } } });
      }
      await tx.update(productModels).set(set).where(inArray(productModels.id, ids));
      return rows.length;
    });
    updateTag(CATALOG_CACHE_TAG);
    return ok(`Muudetud ${count} mudelit.`);
  });
}

export async function bulkListingsAction(formData: FormData): Promise<ActionResult> {
  return runAdminAction("listing.bulk", async (admin) => {
    const parsed = parseBulk(LISTING_BULK_OPERATIONS, formData);
    if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Vigane päring");
    const { operation, ids } = parsed.data;
    const status = operation === "activate" ? ("ACTIVE" as const) : ("HIDDEN" as const);

    const count = await getDb().transaction(async (tx) => {
      const rows = await tx.select().from(supplierListings).where(inArray(supplierListings.id, ids)).for("update");
      for (const row of rows) {
        if (row.status === status) continue;
        await writeAudit(tx, admin, { action: `listing.bulk.${operation}`, entityType: "SupplierListing", entityId: row.id, entityLabel: row.sku, changes: { status: { from: row.status, to: status } } });
      }
      await tx.update(supplierListings).set({ status }).where(inArray(supplierListings.id, ids));
      return rows.length;
    });
    updateTag(CATALOG_CACHE_TAG);
    return ok(`Muudetud ${count} konfiguratsiooni.`);
  });
}

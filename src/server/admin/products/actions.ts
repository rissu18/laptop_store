"use server";

import { eq, inArray } from "drizzle-orm";
import { refresh, updateTag } from "next/cache";
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
import { PERFORMANCE_OVERRIDE_FIELDS, effectivePerformance, parsePerformanceOverride } from "@/domain/catalog/benchmarks";
import { KEYBOARD_REGISTRY } from "@/domain/catalog/keyboard";
import { QUICK_FIX_FIELDS, type QuickFixField } from "@/domain/admin/quick-fix";
import { LISTING_OVERRIDABLE_FIELDS, MODEL_OVERRIDABLE_FIELDS, listingOverridableFields, mergeOverrides } from "@/domain/catalog/overrides";
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
 *   Erand: tarnija müügihinnaga pakkumisel (price_source = SUPPLIER) on müügihind tarnija väli → parandusena.
 * - Iga muudatus: serveripoolne valideerimine → transaktsioon (muudatus + audit) → poe vahemälu tühjendus.
 */

const uuid = z.uuid();
/** Ainult vormis olnud väljad (undefined = välja polnud) — puuduv väli ei tohi tekitada tahtmatut parandust */
const pick = <T extends Record<string, unknown>>(source: T, keys: readonly string[]) => Object.fromEntries(keys.filter((key) => source[key] !== undefined).map((key) => [key, source[key]]));

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
      const allowed = listingOverridableFields(current.priceSource);
      const overrides = mergeOverrides(current, (current.manualOverrides ?? {}) as Record<string, unknown>, pick(input, allowed), allowed);
      const supplierPriced = current.priceSource === "SUPPLIER";
      const [updated] = await tx
        .update(supplierListings)
        .set({ ...(supplierPriced ? {} : { salePriceCents: input.salePriceCents }), status: input.status, manualOverrides: overrides })
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

const KEYBOARD_CODES = new Set(KEYBOARD_REGISTRY.map((k) => k.code));

/**
 * Üks parandus ühele väljale (manual_overrides): klaviatuur registrist või jõudlusväärtus (valideeritud).
 * Tarnija toorandmeid ei puudutata; audit vana → uus (kehtiv väärtus); poe vahemälu + leht värskendatakse.
 */
export async function setListingOverrideAction(id: string, field: QuickFixField, value: string): Promise<ActionResult> {
  return runAdminAction("listing.quick_fix", async (admin) => {
    if (!uuid.safeParse(id).success) return fail("Vigane konfiguratsiooni ID");
    if (!(QUICK_FIX_FIELDS as readonly string[]).includes(field)) return fail("Seda välja ei saa siit parandada");
    let next: string | number;
    if (field === "keyboard") {
      if (!KEYBOARD_CODES.has(value)) return fail("Vali klaviatuur registrist.");
      next = value;
    } else {
      const parsed = parsePerformanceOverride(field, value);
      if (!parsed.ok) return fail(parsed.error);
      next = parsed.value;
    }

    const result = await getDb().transaction(async (tx) => {
      const [current] = await tx.select().from(supplierListings).where(eq(supplierListings.id, id)).for("update");
      if (!current) return fail("Konfiguratsiooni ei leitud");
      const currentOverrides = (current.manualOverrides ?? {}) as Record<string, unknown>;
      // Klaviatuur: tarnija väärtusega sama → parandust ei hoita (nagu vormis); jõudlus: alati parandusena
      const overrides = field === "keyboard" ? mergeOverrides(current, currentOverrides, { keyboard: next }, LISTING_OVERRIDABLE_FIELDS) : { ...currentOverrides, [field]: next };
      const before = quickFixValue(current, field);
      const [updated] = await tx.update(supplierListings).set({ manualOverrides: overrides }).where(eq(supplierListings.id, id)).returning();
      const after = quickFixValue(updated, field);
      if (Object.is(before, after) && JSON.stringify(currentOverrides) === JSON.stringify(overrides)) return ok("Muudatusi polnud.");
      await writeAudit(tx, admin, { action: "listing.update", entityType: "SupplierListing", entityId: id, entityLabel: updated.sku, changes: { [field]: { from: before, to: after } } });
      return ok("Parandus salvestatud.");
    });
    if (result.ok) {
      updateTag(CATALOG_CACHE_TAG);
      refresh();
    }
    return result;
  });
}

/** Kehtiv väärtus auditi jaoks (sama reegel mis pood). */
function quickFixValue(row: typeof supplierListings.$inferSelect, field: QuickFixField): unknown {
  if (field === "keyboard") return effectiveListing(row).keyboard ?? null;
  const p = effectivePerformance({ details: row.details, enrichment: row.enrichment, manualOverrides: row.manualOverrides as Record<string, unknown> });
  return field === "cpuMaxMhz" ? (p.cpuMaxGhz === null ? null : Math.round(p.cpuMaxGhz * 1000)) : field === "cpuBenchmark" ? p.cpuBenchmark : p.gpuBenchmark;
}

/** "Taasta tarnija väärtus": eemaldab ühe välja paranduse. */
export async function clearOverrideAction(entity: "model" | "listing", id: string, field: string): Promise<ActionResult> {
  return runAdminAction(`${entity}.clear_override`, async (admin) => {
    if (!uuid.safeParse(id).success) return fail("Vigane ID");
    const allowed: readonly string[] = entity === "model" ? MODEL_OVERRIDABLE_FIELDS : [...listingOverridableFields("SUPPLIER"), ...PERFORMANCE_OVERRIDE_FIELDS];
    if (!allowed.includes(field)) return fail("Seda välja ei saa taastada");
    const table = entity === "model" ? productModels : supplierListings;

    const result = await getDb().transaction(async (tx) => {
      const [current] = await tx.select().from(table).where(eq(table.id, id)).for("update");
      if (!current) return fail("Kirjet ei leitud");
      // Müügihinna parandus on olemas ainult tarnija hinnaga pakkumisel
      if (field === "salePriceCents" && !("priceSource" in current && current.priceSource === "SUPPLIER")) return fail("Seda välja ei saa taastada");
      const overrides = { ...((current.manualOverrides ?? {}) as Record<string, unknown>) };
      if (!(field in overrides)) return ok("Parandust polnud.");
      const from = overrides[field];
      delete overrides[field];
      const [updated] = await tx.update(table).set({ manualOverrides: overrides }).where(eq(table.id, id)).returning();
      // Jõudluse parandusel pole veergu — "to" = kehtiv väärtus pärast taastamist (tarnija/rikastus)
      const restored = (PERFORMANCE_OVERRIDE_FIELDS as readonly string[]).includes(field) && "sku" in updated ? quickFixValue(updated, field as QuickFixField) : ((current as Record<string, unknown>)[field] ?? null);
      const label = "sku" in current ? current.sku : `${current.family} ${current.model}`;
      await writeAudit(tx, admin, {
        action: `${entity}.override_cleared`,
        entityType: entity === "model" ? "ProductModel" : "SupplierListing",
        entityId: id,
        entityLabel: label,
        changes: { [field]: { from, to: restored } },
      });
      return ok("Tarnija väärtus taastatud.");
    });
    if (result.ok) {
      updateTag(CATALOG_CACHE_TAG);
      refresh();
    }
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

"use server";

import { eq } from "drizzle-orm";
import { updateTag } from "next/cache";
import { changedRows, pricingBandFormSchema, pricingSettingsFormSchema, previewPrices, validateBands } from "@/domain/admin/pricing-admin";
import { formDataToObject, zodFieldErrors } from "@/domain/admin/product-edit";
import type { PricingBand } from "@/domain/pricing/pricing-engine";
import { CATALOG_CACHE_TAG, SETTINGS_CACHE_TAG } from "@/server/cache-tags";
import { getDb } from "@/server/db/client";
import { pricingRules, storeSettings, supplierListings } from "@/server/db/schema";
import { writeSystemLog } from "@/server/logging/system-log";
import { fail, ok, type ActionResult } from "../action-result";
import { diffChanges, writeAudit } from "../audit";
import { runAdminAction } from "../run-action";
import { loadPricingCandidates, loadPricingState } from "./service";

/**
 * Hinnareeglite salvestamine. NB! Salvestamine EI muuda ühegi toote hinda — selleks on eraldi
 * "Rakenda hinnad" samm (eelvaade → kinnitus), et admin näeks enne mõju.
 */
export async function savePricingRulesAction(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  return runAdminAction("pricing.save_rules", async (admin) => {
    const settings = pricingSettingsFormSchema.safeParse(formDataToObject(formData, Object.keys(pricingSettingsFormSchema.shape)));
    if (!settings.success) return fail("Kontrolli välju", zodFieldErrors(settings.error));

    const from = formData.getAll("band.from");
    const bands: PricingBand[] = [];
    for (let i = 0; i < from.length; i++) {
      const band = pricingBandFormSchema.safeParse({
        fromCostCents: from[i],
        toCostCents: formData.getAll("band.to")[i],
        markupFixedCents: formData.getAll("band.fixed")[i],
        markupPercentBps: formData.getAll("band.pct")[i],
      });
      if (!band.success) return fail(`Vahemik ${i + 1}: ${band.error.issues[0]?.message ?? "vigane"}`);
      bands.push(band.data);
    }
    const bandError = validateBands(bands);
    if (bandError) return fail(bandError);
    const sorted = [...bands].sort((a, b) => a.fromCostCents - b.fromCostCents);

    await getDb().transaction(async (tx) => {
      const before = await loadPricingState(tx);
      await tx
        .insert(storeSettings)
        .values({ key: "pricing", value: settings.data, updatedBy: admin.email })
        .onConflictDoUpdate({ target: storeSettings.key, set: { value: settings.data, updatedBy: admin.email } });
      await tx.delete(pricingRules);
      await tx.insert(pricingRules).values(sorted.map((band, position) => ({ ...band, position })));
      const changes = { ...diffChanges(before.settings, settings.data), ...diffChanges({ bands: before.bands }, { bands: sorted }) };
      if (Object.keys(changes).length) await writeAudit(tx, admin, { action: "pricing.rules_update", entityType: "PricingRules", entityId: "pricing", entityLabel: "Hinnareeglid", changes });
    });
    updateTag(SETTINGS_CACHE_TAG);
    return ok("Hinnareeglid salvestatud. Hinnad muutuvad alles pärast „Rakenda hinnad“.");
  });
}

/** Rakendab salvestatud reeglid: arvutab müügihinnad ümber ja salvestab muutunud hinnad. */
export async function applyPricingAction(): Promise<ActionResult> {
  return runAdminAction("pricing.apply", async (admin) => {
    const result = await getDb().transaction(async (tx) => {
      const { config } = await loadPricingState(tx);
      const rows = previewPrices(config, await loadPricingCandidates(tx));
      const changed = changedRows(rows);
      for (const row of changed) {
        await tx.update(supplierListings).set({ salePriceCents: row.calculatedCents }).where(eq(supplierListings.id, row.id));
        await writeAudit(tx, admin, { action: "pricing.apply", entityType: "SupplierListing", entityId: row.id, entityLabel: row.sku, changes: { salePriceCents: { from: row.currentCents, to: row.calculatedCents } } });
      }
      return { changed: changed.length, errors: rows.filter((r) => r.error).length };
    });
    await logPricingApplied(admin.email, result);
    updateTag(CATALOG_CACHE_TAG);
    return ok(`Hinnad rakendatud: muutus ${result.changed} hinda${result.errors ? `, ${result.errors} pakkumist jäeti vahele (vt eelvaadet)` : ""}.`);
  });
}

async function logPricingApplied(adminEmail: string, result: { changed: number; errors: number }) {
  await writeSystemLog({ level: "INFO", source: "ADMIN", message: `Hinnareeglid rakendatud (${result.changed} muudatust)`, details: { admin: adminEmail, ...result } });
}


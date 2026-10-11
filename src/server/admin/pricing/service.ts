import "server-only";
import { asc, eq } from "drizzle-orm";
import { previewPrices, type PricingCandidate } from "@/domain/admin/pricing-admin";
import type { PricingBand } from "@/domain/pricing/pricing-engine";
import { DEFAULT_SETTINGS, parseSetting, toPricingConfig } from "@/domain/settings/settings";
import { requireAdmin } from "@/server/auth/auth";
import { effectiveListing } from "@/server/catalog/db-catalog-mapper";
import type { Database } from "@/server/db/client";
import { getDb } from "@/server/db/client";
import { pricingRules, storeSettings, supplierListings } from "@/server/db/schema";

type Reader = Pick<Database, "select">;

export async function loadPricingState(db: Reader) {
  const [rules, [settingsRow]] = await Promise.all([
    db.select().from(pricingRules).orderBy(asc(pricingRules.fromCostCents)),
    db.select().from(storeSettings).where(eq(storeSettings.key, "pricing")),
  ]);
  const settings = settingsRow ? parseSetting("pricing", settingsRow.value) : DEFAULT_SETTINGS.pricing;
  const bands: PricingBand[] = rules.map((r) => ({ fromCostCents: r.fromCostCents, toCostCents: r.toCostCents, markupFixedCents: r.markupFixedCents, markupPercentBps: r.markupPercentBps }));
  return { settings, bands, config: toPricingConfig(settings, bands) };
}

/**
 * Kõik pakkumised hinnastamise jaoks (efektiivne ostuhind — admini parandus arvestatakse).
 * Tarnija müügihinnaga pakkumisi (price_source = SUPPLIER, nt Laptopid.ee) hinnastamine EI puuduta:
 * nende hind tuleb tarnijalt ja ostuhind on teadmata.
 */
export async function loadPricingCandidates(db: Reader): Promise<PricingCandidate[]> {
  const rows = await db.select().from(supplierListings).orderBy(asc(supplierListings.sku));
  return rows
    .filter((row) => row.status !== "ARCHIVED" && row.priceSource !== "SUPPLIER")
    .map((row) => {
      const listing = effectiveListing(row);
      return { id: listing.id, sku: listing.sku, costCents: listing.supplierPriceCents, vatScheme: listing.vatScheme ?? "UNKNOWN", currentCents: listing.salePriceCents };
    });
}

export async function getPricingOverview() {
  await requireAdmin();
  const db = getDb();
  const [state, candidates] = await Promise.all([loadPricingState(db), loadPricingCandidates(db)]);
  return { ...state, preview: previewPrices(state.config, candidates) };
}

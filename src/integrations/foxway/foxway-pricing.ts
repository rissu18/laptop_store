import { pricingConfig } from "@/config/pricing";
import { percentOf } from "@/domain/money/money";

/**
 * Foxway hinnastus (kinnitatud ärireegel 2026-10-12, vt docs/FOXWAY_SYNC.md → Hind):
 *
 *   müügihind = tarnija efektiivne hind (neto, ilma KM-ita)
 *             + Eesti käibemaks (keskne määr: config/pricing.ts → vatRateBps)
 *             + 60 € (meie juurdehindlus)
 *             + laadija lisatasu (0 / 35 / 90 €, vt domain/catalog/charger.ts)
 *
 * Kõik summad täisarvulistes sentides; arvutab AINULT server (sync). Ümardamist (nt täiseurodeks) ei tehta —
 * see oleks eraldi äriotsus.
 */
export const FOXWAY_MARKUP_CENTS = 6_000;
export const FOXWAY_CURRENCY = "EUR";

/**
 * Tarnija efektiivne hind. Praegu on API `Price` autoriteetne: Swagger ei anna eraldi kampaania-/erihinna välja ja
 * tänases feedis neid pole (Excelit ei kraabita). Kui API hakkab andma selgesõnalist kampaaniahinda, antakse see
 * siia `campaignPriceCents`-ina ja see kehtib, kui on madalam kui tavahind. Välja ei leiutata.
 */
export function foxwayEffectiveSupplierPriceCents(listPriceCents: number, campaignPriceCents: number | null = null): number {
  return campaignPriceCents !== null && campaignPriceCents > 0 && campaignPriceCents < listPriceCents ? campaignPriceCents : listPriceCents;
}

export interface FoxwayPrice {
  supplierPriceCents: number;
  vatCents: number;
  vatRateBps: number;
  markupCents: number;
  chargerCents: number;
  salePriceCents: number;
  /** Meie kulu (tarnija hind + laadija) — sooduskoodi marginaalikaitse jaoks (supplier_price_cents) */
  costCents: number;
}

export function foxwaySalePrice(supplierPriceCents: number, chargerCents: number, vatRateBps = pricingConfig.vatRateBps): FoxwayPrice {
  const vatCents = percentOf(supplierPriceCents, vatRateBps);
  return {
    supplierPriceCents,
    vatCents,
    vatRateBps,
    markupCents: FOXWAY_MARKUP_CENTS,
    chargerCents,
    salePriceCents: supplierPriceCents + vatCents + FOXWAY_MARKUP_CENTS + chargerCents,
    costCents: supplierPriceCents + chargerCents,
  };
}

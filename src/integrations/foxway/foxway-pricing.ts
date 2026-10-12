import { pricingConfig } from "@/config/pricing";
import { percentOf } from "@/domain/money/money";

/**
 * Foxway hinnastus (kinnitatud ärireeglid 2026-10-12, vt docs/FOXWAY_SYNC.md → Hind):
 *
 *   IsVatMargin = false (tavaline KM-kaup, Foxway hind on neto):
 *     müügihind = tarnija hind + Eesti käibemaks tarnija hinnalt (keskne määr: config/pricing.ts → vatRateBps)
 *               + 60 € + laadija lisatasu (0 / 35 / 60 / 90 €, vt domain/catalog/charger.ts)
 *
 *   IsVatMargin = true (kasutatud kauba erikord, KMS §41): Foxway hind on ostuhind, millele KOGU summa ulatuses
 *   käibemaksu EI lisata:
 *     müügihind = tarnija hind + 60 € + laadija lisatasu
 *   Käibemaks arvestatakse hiljem müügi- ja ostuhinna vahelt (marginaal) — mitte kogu müügihinnalt.
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
  /** Kasutatud kauba erikord (IsVatMargin) — käibemaksu ostuhinnale ei lisatud */
  vatMargin: boolean;
  supplierPriceCents: number;
  vatCents: number;
  vatRateBps: number;
  markupCents: number;
  chargerCents: number;
  salePriceCents: number;
  /** Meie kulu (tarnija hind + laadija) — sooduskoodi marginaalikaitse jaoks (supplier_price_cents) */
  costCents: number;
}

export function foxwaySalePrice(supplierPriceCents: number, chargerCents: number, options: { vatMargin?: boolean; vatRateBps?: number } = {}): FoxwayPrice {
  const vatMargin = options.vatMargin === true;
  const vatRateBps = options.vatRateBps ?? pricingConfig.vatRateBps;
  // Erikorra kaubal ostuhinnale KM-i ei lisata (KM tuleb marginaalist, arvestus hiljem)
  const vatCents = vatMargin ? 0 : percentOf(supplierPriceCents, vatRateBps);
  return {
    vatMargin,
    supplierPriceCents,
    vatCents,
    vatRateBps,
    markupCents: FOXWAY_MARKUP_CENTS,
    chargerCents,
    salePriceCents: supplierPriceCents + vatCents + FOXWAY_MARKUP_CENTS + chargerCents,
    costCents: supplierPriceCents + chargerCents,
  };
}

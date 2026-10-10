import type { PricingConfig } from "@/domain/pricing/pricing-engine";

/**
 * Hinnastamise seadistus.
 * Phase 3-s liigub see andmebaasi (`PricingRule`, `SystemSetting`) ja on administ muudetav.
 *
 * TODO: REAL PROVIDER DATA REQUIRED
 * - supplierShippingCents: tarnija tegelik transpordihind
 * - paymentFee*: valitud makseteenuse pakkuja tegelik tasu
 * - juurdehindlused ja miinimumkasum: äriline otsus
 * Praegused numbrid on arenduse näidisväärtused.
 */
export const pricingConfig: PricingConfig = {
  vatRateBps: 2400, // Eesti standardmäär alates 01.07.2025
  supplierShippingCents: 1500,
  warrantyReserveBps: 300,
  paymentFeeBps: 150,
  paymentFeeFixedCents: 15,
  bands: [
    { fromCostCents: 0, toCostCents: 30_000, markupFixedCents: 4_500, markupPercentBps: 0 },
    { fromCostCents: 30_000, toCostCents: 50_000, markupFixedCents: 6_000, markupPercentBps: 0 },
    { fromCostCents: 50_000, toCostCents: 80_000, markupFixedCents: 0, markupPercentBps: 1_200 },
    { fromCostCents: 80_000, toCostCents: null, markupFixedCents: 0, markupPercentBps: 1_000 },
  ],
  rounding: [
    { fromCents: 0, stepCents: 1_000, endingCents: 900 }, // 429, 439, 499 …
    { fromCents: 100_000, stepCents: 5_000, endingCents: 4_900 }, // 1049, 1099 …
  ],
  minProfitCents: 3_000,
  minProfitBps: 600,
  minSalePriceCents: 9_900,
};

import { describe, expect, it } from "vitest";
import {
  PricingError,
  calculatePrice,
  findBand,
  roundPrice,
  vatIncluded,
  type PricingConfig,
} from "./pricing-engine";

const config: PricingConfig = {
  vatRateBps: 2400,
  supplierShippingCents: 1500,
  warrantyReserveBps: 300,
  paymentFeeBps: 150,
  paymentFeeFixedCents: 15,
  bands: [
    { fromCostCents: 0, toCostCents: 30_000, markupFixedCents: 4_500, markupPercentBps: 0 },
    { fromCostCents: 30_000, toCostCents: 50_000, markupFixedCents: 6_000, markupPercentBps: 0 },
    { fromCostCents: 50_000, toCostCents: null, markupFixedCents: 0, markupPercentBps: 1_200 },
  ],
  rounding: [
    { fromCents: 0, stepCents: 1_000, endingCents: 900 },
    { fromCents: 100_000, stepCents: 5_000, endingCents: 4_900 },
  ],
  minProfitCents: 3_000,
  minProfitBps: 600,
  minSalePriceCents: 9_900,
};

describe("roundPrice", () => {
  it("ümardab ÜLES järgmise 9-ga lõppeva hinnani", () => {
    expect(roundPrice(config, 42_362)).toBe(42_900); // 423,62 → 429
    expect(roundPrice(config, 49_700)).toBe(49_900); // 497 → 499
    expect(roundPrice(config, 43_001)).toBe(43_900);
  });

  it("ei muuda hinda, mis juba vastab reeglile", () => {
    expect(roundPrice(config, 42_900)).toBe(42_900);
  });

  it("kasutab üle 1000 € hindadele suuremat sammu", () => {
    expect(roundPrice(config, 101_200)).toBe(104_900);
    expect(roundPrice(config, 105_000)).toBe(109_900);
  });

  it("ei ümarda kunagi allapoole", () => {
    for (let raw = 10_000; raw < 200_000; raw += 1_337) {
      expect(roundPrice(config, raw)).toBeGreaterThanOrEqual(raw);
    }
  });
});

describe("findBand", () => {
  it("valib ostuhinnale vastava vahemiku (alumine piir kaasa arvatud)", () => {
    expect(findBand(config, 29_999).markupFixedCents).toBe(4_500);
    expect(findBand(config, 30_000).markupFixedCents).toBe(6_000);
    expect(findBand(config, 90_000).markupPercentBps).toBe(1_200);
  });
});

describe("vatIncluded", () => {
  it("tavakorras arvutab KM kogu hinnalt", () => {
    expect(vatIncluded(config, 12_400, 5_000, "STANDARD")).toBe(2_400);
  });

  it("erikorras arvutab KM ainult marginaalilt", () => {
    // marginaal 124 € → KM 24 €
    expect(vatIncluded(config, 32_400, 20_000, "MARGIN")).toBe(2_400);
  });
});

describe("calculatePrice", () => {
  it("arvutab tavakorra hinna kõigi kuludega", () => {
    const result = calculatePrice(config, { costCents: 34_000, vatScheme: "STANDARD" });
    // (340 + 15 + 10,20 + 60) × 1,24 = 527,25 → + makseteenus → 535,43 → 539
    expect(result.saleCents).toBe(53_900);
    expect(result.markupCents).toBe(6_000);
    expect(result.profitCents).toBeGreaterThan(config.minProfitCents);
  });

  it("annab erikorras madalama hinna kui tavakorras", () => {
    const standard = calculatePrice(config, { costCents: 34_000, vatScheme: "STANDARD" });
    const margin = calculatePrice(config, { costCents: 34_000, vatScheme: "MARGIN" });
    expect(margin.saleCents).toBeLessThan(standard.saleCents);
  });

  it("kasum ei jää kunagi alla miinimumi", () => {
    for (let cost = 5_000; cost < 150_000; cost += 2_500) {
      for (const vatScheme of ["STANDARD", "MARGIN"] as const) {
        const result = calculatePrice(config, { costCents: cost, vatScheme });
        expect(result.profitCents).toBeGreaterThanOrEqual(config.minProfitCents);
        expect(result.saleCents).toBeGreaterThan(cost);
      }
    }
  });

  it("tõstab hinda, kui reeglid annaksid liiga väikese kasumi", () => {
    const lowMarkup: PricingConfig = {
      ...config,
      bands: [{ fromCostCents: 0, toCostCents: null, markupFixedCents: 100, markupPercentBps: 0 }],
    };
    const result = calculatePrice(lowMarkup, { costCents: 20_000, vatScheme: "STANDARD" });
    expect(result.raisedForMinProfit).toBe(true);
    expect(result.profitCents).toBeGreaterThanOrEqual(lowMarkup.minProfitCents);
  });

  it("rakendab absoluutset alampiiri", () => {
    const result = calculatePrice(config, { costCents: 1_000, vatScheme: "STANDARD" });
    expect(result.saleCents).toBeGreaterThanOrEqual(config.minSalePriceCents);
  });

  it("keeldub vigasest ostuhinnast (nt tarnija API viga)", () => {
    expect(() => calculatePrice(config, { costCents: 0, vatScheme: "STANDARD" })).toThrow(PricingError);
    expect(() => calculatePrice(config, { costCents: -500, vatScheme: "STANDARD" })).toThrow(PricingError);
    expect(() => calculatePrice(config, { costCents: 123.45, vatScheme: "STANDARD" })).toThrow(PricingError);
  });

  it("keeldub hinnastamast, kui käibemaksukäsitlus on teadmata", () => {
    expect(() => calculatePrice(config, { costCents: 30_000, vatScheme: "UNKNOWN" })).toThrow(
      /käibemaksukäsitlus/,
    );
  });
});

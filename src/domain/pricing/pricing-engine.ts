import { percentOf, type Cents } from "@/domain/money/money";
import type { VatScheme } from "@/domain/catalog/types";

/**
 * Hinnastamismootor.
 *
 *   ostuhind
 *   + transport tarnijalt
 *   + garantiiriski reserv (% ostuhinnast)
 *   + juurdehindlus (hinnavahemiku reegel: fikseeritud + %)
 *   + käibemaks (tavakord: kogu summalt; erikord: ainult marginaalilt)
 *   + makseteenuse tasu
 *   → ümardamine ÜLES hinnapsühholoogia reegliga
 *   → kaitse: kasum peab olema vähemalt miinimum, muidu hinda tõstetakse; ebaloogilise sisendi korral viga
 *
 * Kõik summad sentides, protsendid baaspunktides (1500 = 15%).
 * Funktsioon on puhas (ei loe andmebaasi ega kella) — seetõttu lihtne testida.
 */

export interface PricingBand {
  /** Kehtib ostuhinnale vahemikus [fromCostCents, toCostCents) */
  fromCostCents: Cents;
  toCostCents: Cents | null;
  markupFixedCents: Cents;
  markupPercentBps: number;
}

export interface RoundingRule {
  /** Kehtib toorhinnale alates sellest summast */
  fromCents: Cents;
  /** Hinnasamm, nt 1000 = 10 € */
  stepCents: Cents;
  /** Lõpp sammu sees, nt 900 → hind lõpeb 9 €-ga (429, 439, …) */
  endingCents: Cents;
}

export interface PricingConfig {
  vatRateBps: number;
  supplierShippingCents: Cents;
  warrantyReserveBps: number;
  paymentFeeBps: number;
  paymentFeeFixedCents: Cents;
  bands: PricingBand[];
  rounding: RoundingRule[];
  minProfitCents: Cents;
  minProfitBps: number;
  /** Absoluutne alampiir — ükski toode ei lähe müüki sellest odavamalt. */
  minSalePriceCents: Cents;
}

export interface PricingInput {
  costCents: Cents;
  vatScheme: VatScheme;
}

export interface PriceBreakdown {
  saleCents: Cents;
  costCents: Cents;
  supplierShippingCents: Cents;
  warrantyReserveCents: Cents;
  markupCents: Cents;
  vatCents: Cents;
  paymentFeeCents: Cents;
  profitCents: Cents;
  /** Kas hinda tuli miinimumkasumi tõttu tõsta */
  raisedForMinProfit: boolean;
}

export class PricingError extends Error {
  constructor(
    public readonly code: "INVALID_COST" | "NO_BAND" | "VAT_SCHEME_UNKNOWN" | "UNPROFITABLE",
    message: string,
  ) {
    super(message);
    this.name = "PricingError";
  }
}

export function findBand(config: PricingConfig, costCents: Cents): PricingBand {
  const band = config.bands.find(
    (b) => costCents >= b.fromCostCents && (b.toCostCents === null || costCents < b.toCostCents),
  );
  if (!band) throw new PricingError("NO_BAND", `Hinnareeglit ostuhinnale ${costCents} senti ei leitud`);
  return band;
}

/** Ümardab hinna ÜLES järgmise sobiva lõpuga: 423,62 € → 429 €, 497 € → 499 €. */
export function roundPrice(config: PricingConfig, rawCents: Cents): Cents {
  const rule = [...config.rounding]
    .sort((a, b) => b.fromCents - a.fromCents)
    .find((r) => rawCents >= r.fromCents);
  if (!rule) return Math.ceil(rawCents / 100) * 100;
  const steps = Math.ceil((rawCents - rule.endingCents) / rule.stepCents);
  return steps * rule.stepCents + rule.endingCents;
}

/** Käibemaks, mis sisaldub müügihinnas. */
export function vatIncluded(config: PricingConfig, saleCents: Cents, costCents: Cents, scheme: VatScheme): Cents {
  if (scheme === "STANDARD") {
    return Math.round((saleCents * config.vatRateBps) / (10_000 + config.vatRateBps));
  }
  // Kasutatud kauba erikord: KM ainult marginaalilt (müügihind − ostuhind)
  const margin = Math.max(0, saleCents - costCents);
  return Math.round((margin * config.vatRateBps) / (10_000 + config.vatRateBps));
}

function breakdownFor(config: PricingConfig, input: PricingInput, saleCents: Cents): PriceBreakdown {
  const supplierShippingCents = config.supplierShippingCents;
  const warrantyReserveCents = percentOf(input.costCents, config.warrantyReserveBps);
  const vatCents = vatIncluded(config, saleCents, input.costCents, input.vatScheme);
  const paymentFeeCents = percentOf(saleCents, config.paymentFeeBps) + config.paymentFeeFixedCents;
  const profitCents =
    saleCents - vatCents - paymentFeeCents - input.costCents - supplierShippingCents - warrantyReserveCents;
  return {
    saleCents,
    costCents: input.costCents,
    supplierShippingCents,
    warrantyReserveCents,
    markupCents: 0,
    vatCents,
    paymentFeeCents,
    profitCents,
    raisedForMinProfit: false,
  };
}

function isProfitable(config: PricingConfig, b: PriceBreakdown): boolean {
  return b.profitCents >= config.minProfitCents && b.profitCents * 10_000 >= b.saleCents * config.minProfitBps;
}

/**
 * Madalaim müügihind, mille juures toode veel vastab miinimumkasumi reeglitele
 * (minProfitCents, minProfitBps, minSalePriceCents) — ilma juurdehindluse ja ümardamiseta.
 * Kasutab sama kasumiarvutust mis calculatePrice (sooduskoodide marginaalikaitse, vt docs/DISCOUNTS.md).
 * Tagastab null, kui hinda ei saa arvutada (vigane ostuhind või teadmata käibemaksurežiim).
 */
export function minimumAllowedPrice(config: PricingConfig, input: PricingInput): Cents | null {
  if (!Number.isInteger(input.costCents) || input.costCents <= 0 || input.vatScheme === "UNKNOWN") return null;
  // Kasum kasvab müügihinnaga monotoonselt → kahendotsing
  let low = 0;
  let high = Math.max(config.minSalePriceCents, input.costCents * 4 + 100_000);
  if (!isProfitable(config, breakdownFor(config, input, high))) return null;
  while (low < high) {
    const mid = Math.floor((low + high) / 2);
    if (isProfitable(config, breakdownFor(config, input, mid))) high = mid;
    else low = mid + 1;
  }
  return Math.max(low, config.minSalePriceCents);
}

export function calculatePrice(config: PricingConfig, input: PricingInput): PriceBreakdown {
  if (!Number.isInteger(input.costCents) || input.costCents <= 0) {
    throw new PricingError("INVALID_COST", `Vigane ostuhind: ${input.costCents}`);
  }
  if (input.vatScheme === "UNKNOWN") {
    // Ilma käibemaksukäsitluseta ei saa hinda õigesti arvutada — toodet ei müüda.
    throw new PricingError("VAT_SCHEME_UNKNOWN", "Toote käibemaksukäsitlus on teadmata");
  }

  const band = findBand(config, input.costCents);
  const markupCents = band.markupFixedCents + percentOf(input.costCents, band.markupPercentBps);
  const warrantyReserveCents = percentOf(input.costCents, config.warrantyReserveBps);
  const netAdditions = config.supplierShippingCents + warrantyReserveCents + markupCents;

  // Hind enne makseteenuse tasu
  const beforeFee =
    input.vatScheme === "STANDARD"
      ? Math.round(((input.costCents + netAdditions) * (10_000 + config.vatRateBps)) / 10_000)
      : input.costCents + Math.round((netAdditions * (10_000 + config.vatRateBps)) / 10_000);

  // Makseteenuse tasu arvutatakse lõpphinnalt, seega "gross-up": hind = (x + fikseeritud) / (1 − %)
  const raw = Math.ceil(((beforeFee + config.paymentFeeFixedCents) * 10_000) / (10_000 - config.paymentFeeBps));

  let saleCents = Math.max(roundPrice(config, raw), config.minSalePriceCents);
  let result = breakdownFor(config, input, saleCents);
  let raised = false;

  // Kaitse: kui kasum jääb alla miinimumi, tõsta hinda järgmise ümardusastmeni
  for (let attempt = 0; attempt < 50 && !isProfitable(config, result); attempt++) {
    saleCents = roundPrice(config, saleCents + 1);
    result = breakdownFor(config, input, saleCents);
    raised = true;
  }
  if (!isProfitable(config, result)) {
    throw new PricingError("UNPROFITABLE", `Ostuhinnaga ${input.costCents} ei saavutata minimaalset kasumit`);
  }

  return { ...result, markupCents, raisedForMinProfit: raised };
}

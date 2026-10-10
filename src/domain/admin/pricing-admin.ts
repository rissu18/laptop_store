import { z } from "zod";
import type { VatScheme } from "@/domain/catalog/types";
import { calculatePrice, PricingError, type PricingBand, type PricingConfig } from "@/domain/pricing/pricing-engine";
import { ROUNDING_MODES, type Settings } from "@/domain/settings/settings";
import { euroCents } from "./product-edit";

/**
 * Hinnastamise admin: reeglite valideerimine, eelvaade ja rakendamise arvutus.
 * Eelvaade EI muuda midagi; rakendamine on eraldi samm kinnitusega.
 */

const percentBps = (max: number) =>
  z.preprocess(
    (v) => (typeof v === "string" ? v.replace(",", ".").replace("%", "").trim() : v),
    z.coerce.number({ error: "Peab olema arv" }).min(0, "Ei saa olla negatiivne").max(max, `Kuni ${max}%`).transform((pct) => Math.round(pct * 100)),
  );
const requiredEuro = euroCents.refine((v) => v !== null, "Kohustuslik väli").transform((v) => v as number);

export const pricingSettingsFormSchema = z.object({
  vatRateBps: percentBps(50),
  supplierShippingCents: requiredEuro,
  warrantyReserveBps: percentBps(50),
  paymentFeeBps: percentBps(10),
  paymentFeeFixedCents: requiredEuro,
  minProfitCents: requiredEuro,
  minProfitBps: percentBps(90),
  minSalePriceCents: requiredEuro,
  rounding: z.enum(ROUNDING_MODES),
});

export const pricingBandFormSchema = z.object({
  fromCostCents: requiredEuro,
  toCostCents: euroCents,
  markupFixedCents: requiredEuro,
  markupPercentBps: percentBps(200),
});

/** Vahemikud peavad algama 0-st, olema järjestikused ja ilma aukude/kattumisteta; viimane võib olla lõputu. */
export function validateBands(bands: PricingBand[]): string | null {
  if (bands.length === 0) return "Lisa vähemalt üks hinnavahemik";
  if (bands.length > 30) return "Liiga palju vahemikke";
  const sorted = [...bands].sort((a, b) => a.fromCostCents - b.fromCostCents);
  if (sorted[0].fromCostCents !== 0) return "Esimene vahemik peab algama 0 €-st";
  for (const [index, band] of sorted.entries()) {
    const isLast = index === sorted.length - 1;
    if (band.toCostCents !== null && band.toCostCents <= band.fromCostCents) return `Vahemik ${index + 1}: "kuni" peab olema suurem kui "alates"`;
    if (!isLast) {
      if (band.toCostCents === null) return `Vahemik ${index + 1}: ainult viimane vahemik võib olla ülemise piirita`;
      if (sorted[index + 1].fromCostCents !== band.toCostCents) return `Vahemike ${index + 1} ja ${index + 2} vahel on auk või kattumine`;
    }
  }
  return null;
}

export interface PricingCandidate {
  id: string;
  sku: string;
  costCents: number | null;
  vatScheme: string;
  currentCents: number | null;
}

export interface PricingPreviewRow {
  id: string;
  sku: string;
  costCents: number | null;
  currentCents: number | null;
  calculatedCents: number | null;
  differenceCents: number | null;
  /** Kasum pärast kulusid (KM, makse-, garantii- ja tarnekulu) */
  profitCents: number | null;
  marginPct: number | null;
  error: string | null;
}

export function previewPrices(config: PricingConfig, candidates: PricingCandidate[]): PricingPreviewRow[] {
  return candidates.map((candidate) => {
    const base = { id: candidate.id, sku: candidate.sku, costCents: candidate.costCents, currentCents: candidate.currentCents };
    if (candidate.costCents === null) return { ...base, calculatedCents: null, differenceCents: null, profitCents: null, marginPct: null, error: "Ostuhind puudub" };
    try {
      const result = calculatePrice(config, { costCents: candidate.costCents, vatScheme: candidate.vatScheme as VatScheme });
      return {
        ...base,
        calculatedCents: result.saleCents,
        differenceCents: candidate.currentCents === null ? null : result.saleCents - candidate.currentCents,
        profitCents: result.profitCents,
        marginPct: Math.round((result.profitCents / result.saleCents) * 1000) / 10,
        error: null,
      };
    } catch (error) {
      if (!(error instanceof PricingError)) throw error;
      return { ...base, calculatedCents: null, differenceCents: null, profitCents: null, marginPct: null, error: error.message };
    }
  });
}

/** Read, mille hind rakendamisel muutub. */
export function changedRows(rows: PricingPreviewRow[]): PricingPreviewRow[] {
  return rows.filter((row) => row.calculatedCents !== null && row.calculatedCents !== row.currentCents);
}

export type PricingSettings = Settings["pricing"];

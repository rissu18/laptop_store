import { normalizeCode, validateCodeFormat } from "@/domain/discounts/code";
import {
  discountFailureMessage,
  evaluateDiscount,
  type DiscountCartLine,
  type DiscountEvaluation,
  type DiscountRule,
} from "@/domain/discounts/discount-engine";
import { minimumAllowedPrice, type PricingConfig } from "@/domain/pricing/pricing-engine";
import type { VatScheme } from "@/domain/catalog/types";
import { loadPricingState } from "@/server/admin/pricing/service";
import type { Database } from "@/server/db/client";
import { findDiscountByNormalizedCode, loadListingCosts, toDiscountRule } from "./discount-repository";
import { isDiscountValidationBlocked, recordDiscountFailure } from "./discount-rate-limit";

/** Serveris arvutatud ostukorvi rida (hinnad andmebaasist), millest soodustus arvutatakse. */
export interface PricedCartLine {
  sku: string;
  productSlug: string;
  manufacturer: string;
  unitPriceCents: number;
  quantity: number;
}

/**
 * Avalik tulemus kliendile. EI sisalda admini märkmeid, kasutuspiirangut, kasutuste arvu,
 * kehtivusala ega muud sisemist infot.
 */
export interface PublicDiscountResult {
  valid: boolean;
  code: string;
  eligibleSubtotalCents: number;
  discountAmountCents: number;
  freeShipping: boolean;
  reason: string | null;
  message: string;
}

export function toPublicResult(code: string, evaluation: DiscountEvaluation): PublicDiscountResult {
  if (!evaluation.valid) {
    return { valid: false, code, eligibleSubtotalCents: 0, discountAmountCents: 0, freeShipping: false, reason: evaluation.reason, message: evaluation.message };
  }
  return {
    valid: true,
    code: evaluation.code,
    eligibleSubtotalCents: evaluation.eligibleSubtotalCents,
    discountAmountCents: evaluation.discountAmountCents,
    freeShipping: evaluation.freeShipping,
    reason: null,
    message: evaluation.freeShipping ? "Tasuta tarne rakendub tellimuse vormistamisel." : "Sooduskood rakendatud.",
  };
}

/** Ostukorvi read → DiscountEngine'i read koos marginaali alampiiriga (hinnastamise miinimumkasum). */
export async function toDiscountCartLines(db: Pick<Database, "select">, lines: PricedCartLine[], pricing?: PricingConfig): Promise<DiscountCartLine[]> {
  const [costs, config] = await Promise.all([loadListingCosts(db, lines.map((l) => l.sku)), pricing ? Promise.resolve(pricing) : loadPricingState(db).then((s) => s.config)]);
  return lines.map((line) => {
    const cost = costs.get(line.sku);
    const minimumUnitPriceCents =
      cost?.costCents != null && cost.vatScheme ? minimumAllowedPrice(config, { costCents: cost.costCents, vatScheme: cost.vatScheme as VatScheme }) : null;
    return { listing: line.sku, productModel: line.productSlug, manufacturer: line.manufacturer, unitPriceCents: line.unitPriceCents, quantity: line.quantity, minimumUnitPriceCents };
  });
}

export async function loadDiscountRule(db: Pick<Database, "select">, code: string): Promise<DiscountRule | null> {
  const row = await findDiscountByNormalizedCode(db, normalizeCode(code));
  return row ? toDiscountRule(db, row) : null;
}

/**
 * Ostukorvi sooduskoodi kontroll (avalik). Järjekord: vorming → piirang → kood andmebaasist →
 * DiscountEngine serveri ajaga. Ebaõnnestunud katse salvestatakse piirangu jaoks.
 * NB! Kontrollimine EI suurenda kasutuste arvu — seda teeb ainult kinnitatud tellimus (redemptions.ts).
 */
export async function evaluateCartDiscount(db: Database, input: { code: string; lines: PricedCartLine[]; ip: string; now?: Date }): Promise<PublicDiscountResult> {
  const now = input.now ?? new Date();
  const display = input.code.normalize("NFKC").trim().slice(0, 40);

  if (await isDiscountValidationBlocked(db, input.ip, now)) {
    return { valid: false, code: display, eligibleSubtotalCents: 0, discountAmountCents: 0, freeShipping: false, reason: "RATE_LIMITED", message: discountFailureMessage("RATE_LIMITED") };
  }
  if (validateCodeFormat(input.code)) {
    await recordDiscountFailure(db, input.ip);
    return { valid: false, code: display, eligibleSubtotalCents: 0, discountAmountCents: 0, freeShipping: false, reason: "NOT_FOUND", message: discountFailureMessage("NOT_FOUND") };
  }

  const rule = await loadDiscountRule(db, input.code);
  const evaluation = evaluateDiscount(rule, rule ? await toDiscountCartLines(db, input.lines) : [], now);
  if (!evaluation.valid && evaluation.reason !== "EMPTY_CART") await recordDiscountFailure(db, input.ip);
  return toPublicResult(rule?.code ?? display, evaluation);
}

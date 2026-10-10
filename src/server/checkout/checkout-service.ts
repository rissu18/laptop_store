import { inArray, sql } from "drizzle-orm";
import { resolveCheckoutMode, type CheckoutMode } from "@/domain/checkout/checkout-mode";
import { formatSpecLine } from "@/domain/catalog/format";
import type { CatalogItem } from "@/domain/catalog/types";
import { evaluateDiscount, type DiscountEvaluation, type DiscountRule } from "@/domain/discounts/discount-engine";
import { normalizeCode, validateCodeFormat } from "@/domain/discounts/code";
import { availableShippingMethods, quoteShipping, type ShippingQuote } from "@/domain/shipping/shipping";
import type { Settings } from "@/domain/settings/settings";
import { mapCatalogRows } from "@/server/catalog/db-catalog-mapper";
import type { Database } from "@/server/db/client";
import { productImages, productModels, supplierListings } from "@/server/db/schema";
import { findDiscountByNormalizedCode, toDiscountRule } from "@/server/discounts/discount-repository";
import { toDiscountCartLines } from "@/server/discounts/discount-service";
import { getConfiguredPaymentProvider } from "@/server/payments/payment-provider";
import { readSettings } from "@/server/settings/read-settings";

/**
 * Kassa serveripoolne arvutus. Brauserist võetakse AINULT pakkumise ID, kogus ja sooduskoodi tekst.
 *
 *   1. pakkumised otse PostgreSQL-ist (mitte vahemälust) + efektiivsed väärtused
 *   2. kas pakkumine on aktiivne ja poes müüdav (mudel + pakkumine ACTIVE, andmed täielikud)
 *   3. hetkehinnad   4. laoseis   5. vahesumma
 *   6. sooduskood uuesti DiscountEngine'iga (olek, kuupäevad, piirang, tooted, välistused, maksimum, marginaal)
 *   7. soodustus   8. tarne (seadetest)   9. kokkusumma
 */

export interface CheckoutItemInput {
  variantId: string;
  quantity: number;
}

export type CheckoutIssue =
  | { kind: "UNAVAILABLE"; variantId: string; message: string }
  | { kind: "INSUFFICIENT_STOCK"; variantId: string; title: string; requested: number; available: number; message: string };

export interface QuoteLine {
  variantId: string;
  sku: string;
  title: string;
  specLine: string;
  grade: string;
  imageUrl: string | null;
  unitPriceCents: number;
  quantity: number;
  lineSubtotalCents: number;
  discountCents: number;
  lineTotalCents: number;
}

/** Kliendile saadetav kokkuvõte (ainult kuvamiseks — tellimuse loomisel arvutatakse kõik uuesti). */
export interface CheckoutQuote {
  mode: CheckoutMode;
  lines: QuoteLine[];
  issues: CheckoutIssue[];
  subtotalCents: number;
  discount: { code: string; type: string; amountCents: number; freeShipping: boolean } | null;
  /** Sooduskood sisestati, aga see ei kehti (põhjus kliendile) */
  discountError: string | null;
  shipping: { code: string; name: string; amountCents: number; freeReason: ShippingQuote["freeReason"] };
  totalCents: number;
  currency: "EUR";
}

/** Tellimuse loomiseks vajalik sisemine info (DB ID-d, snapshot'id) — kliendile ei saadeta. */
export interface CheckoutComputation {
  quote: CheckoutQuote;
  settings: Settings;
  items: { item: CatalogItem; listingId: string; productModelId: string; quantity: number; discountCents: number }[];
  discountRule: DiscountRule | null;
  discountRuleId: string | null;
  evaluation: DiscountEvaluation | null;
}

/** Avalik pakkumise ID ("mock-ms-10231") → andmebaasi read */
async function loadItems(db: Pick<Database, "select">, variantIds: string[]) {
  if (!variantIds.length) return { items: new Map<string, { item: CatalogItem; listingId: string; productModelId: string }>() };
  const listings = await db
    .select()
    .from(supplierListings)
    .where(inArray(sql`lower(${supplierListings.supplier} || '-' || ${supplierListings.supplierProductId})`, variantIds.map((id) => id.toLowerCase())));
  const modelIds = [...new Set(listings.map((l) => l.productModelId))];
  const [models, images] = modelIds.length
    ? await Promise.all([db.select().from(productModels).where(inArray(productModels.id, modelIds)), db.select().from(productImages).where(inArray(productImages.productModelId, modelIds))])
    : [[], []];
  // Sama teisendus mis poes: ainult ACTIVE mudelid/pakkumised, laos, täielike andmetega
  const { items } = mapCatalogRows(models, listings, images);
  const listingBySku = new Map(listings.map((l) => [l.sku, l]));
  const result = new Map<string, { item: CatalogItem; listingId: string; productModelId: string }>();
  for (const searchable of items) {
    const { searchText: _searchText, ...item } = searchable;
    void _searchText;
    const row = listingBySku.get(item.variant.sku)!;
    result.set(item.variant.id, { item, listingId: row.id, productModelId: row.productModelId });
  }
  return { items: result };
}

export async function computeCheckout(db: Pick<Database, "select">, input: { items: CheckoutItemInput[]; couponCode: string | null; now?: Date }): Promise<CheckoutComputation> {
  const now = input.now ?? new Date();
  const settings = await readSettings(db);
  const mode = resolveCheckoutMode({ prototypeMode: settings.store.prototypeMode, paymentProviderConfigured: getConfiguredPaymentProvider() !== null });

  // Sama pakkumine mitu korda → kogused kokku
  const merged = new Map<string, number>();
  for (const { variantId, quantity } of input.items) merged.set(variantId, (merged.get(variantId) ?? 0) + quantity);

  const { items: found } = await loadItems(db, [...merged.keys()]);
  const issues: CheckoutIssue[] = [];
  const valid: CheckoutComputation["items"] = [];
  for (const [variantId, quantity] of merged) {
    const entry = found.get(variantId);
    if (!entry) {
      issues.push({ kind: "UNAVAILABLE", variantId, message: "Toode ei ole enam saadaval." });
      continue;
    }
    const available = entry.item.variant.stock.quantity;
    if (quantity > available) {
      issues.push({ kind: "INSUFFICIENT_STOCK", variantId, title: entry.item.product.title, requested: quantity, available, message: "Valitud kogus ei ole enam saadaval." });
      continue;
    }
    valid.push({ ...entry, quantity, discountCents: 0 });
  }

  const subtotalCents = valid.reduce((sum, v) => sum + v.item.variant.price.saleCents * v.quantity, 0);

  // Sooduskood: SAMA DiscountEngine mis ostukorvis — brauseri varasemat tulemust ei usaldata
  let discountRule: DiscountRule | null = null;
  let discountRuleId: string | null = null;
  let evaluation: DiscountEvaluation | null = null;
  let discountError: string | null = null;
  const code = input.couponCode?.trim() || null;
  if (code && valid.length) {
    const row = validateCodeFormat(code) ? null : await findDiscountByNormalizedCode(db, normalizeCode(code));
    discountRule = row ? await toDiscountRule(db, row) : null;
    discountRuleId = row?.id ?? null;
    const lines = discountRule
      ? await toDiscountCartLines(
          db,
          valid.map((v) => ({ sku: v.item.variant.sku, productSlug: v.item.product.slug, manufacturer: v.item.product.brand, unitPriceCents: v.item.variant.price.saleCents, quantity: v.quantity })),
        )
      : [];
    evaluation = evaluateDiscount(discountRule, lines, now);
    if (evaluation.valid) {
      for (const [i, allocation] of evaluation.allocations.entries()) valid[i].discountCents = allocation.discountCents;
    } else {
      discountError = evaluation.message;
    }
  }
  const discountCents = evaluation?.valid ? evaluation.discountAmountCents : 0;
  const productsTotal = Math.max(0, subtotalCents - discountCents);

  const method = availableShippingMethods(settings.delivery)[0];
  const shipping = quoteShipping(method, productsTotal, evaluation?.valid === true && evaluation.freeShipping);

  const quote: CheckoutQuote = {
    mode,
    lines: valid.map(({ item, quantity, discountCents: lineDiscount }) => {
      const lineSubtotalCents = item.variant.price.saleCents * quantity;
      return {
        variantId: item.variant.id,
        sku: item.variant.sku,
        title: item.product.title,
        specLine: formatSpecLine(item),
        grade: item.variant.grade,
        imageUrl: item.product.images[0]?.thumbnailUrl ?? null,
        unitPriceCents: item.variant.price.saleCents,
        quantity,
        lineSubtotalCents,
        discountCents: lineDiscount,
        lineTotalCents: lineSubtotalCents - lineDiscount,
      };
    }),
    issues,
    subtotalCents,
    discount: evaluation?.valid ? { code: evaluation.code, type: evaluation.type, amountCents: discountCents, freeShipping: evaluation.freeShipping } : null,
    discountError,
    shipping: { code: method.code, name: method.name, amountCents: shipping.amountCents, freeReason: shipping.freeReason },
    totalCents: productsTotal + shipping.amountCents,
    currency: "EUR",
  };
  return { quote, settings, items: valid, discountRule, discountRuleId, evaluation };
}

export interface PriceChange {
  variantId: string;
  title: string;
  oldCents: number;
  newCents: number;
}

/**
 * Võrdleb hindu, mida klient nägi (ja kinnitas), praeguste hindadega. Kliendi hinda EI kasutata
 * arvutuseks — ainult selleks, et mitte luua tellimust summaga, mida klient ei näinud.
 */
export function detectPriceChanges(quote: CheckoutQuote, acknowledged: { variantId: string; unitPriceCents: number }[]): PriceChange[] {
  const seen = new Map(acknowledged.map((a) => [a.variantId, a.unitPriceCents]));
  return quote.lines.flatMap((line) => {
    const old = seen.get(line.variantId);
    return old !== undefined && old !== line.unitPriceCents ? [{ variantId: line.variantId, title: line.title, oldCents: old, newCents: line.unitPriceCents }] : [];
  });
}

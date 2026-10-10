"use server";

import { z } from "zod";
import { storeConfig } from "@/config/store";
import type { CatalogItem } from "@/domain/catalog/types";
import { getItemsByVariantIds } from "@/server/catalog/catalog-service";
import { getClientMeta } from "@/server/auth/auth";
import { getDb, isDatabaseConfigured } from "@/server/db/client";
import { evaluateCartDiscount, type PricedCartLine, type PublicDiscountResult } from "@/server/discounts/discount-service";
import { errorMessage, newErrorId, writeSystemLog } from "@/server/logging/system-log";

/**
 * Ostukorvi ja võrdluse serveripoolne arvutus.
 * Brauser saadab AINULT toote ID-d, kogused ja (valikuliselt) sooduskoodi TEKSTI.
 * Hinnad, laoseis, soodustus ja summad arvutatakse siin — soodustuse summat brauserist ei võeta kunagi.
 * (Phase 5-s kontrollitakse enne makset hinda ja laoseisu lisaks reaalajas tarnijalt.)
 */

const cartInputSchema = z
  .array(z.object({ variantId: z.string().min(1).max(100), quantity: z.number().int().min(1).max(10) }))
  .max(20);

export interface ResolvedCartLine {
  item: CatalogItem;
  quantity: number;
  /** Kogus piiratakse laoseisuga */
  maxQuantity: number;
  lineTotalCents: number;
}

export interface ResolvedCart {
  lines: ResolvedCartLine[];
  /** ID-d, mida enam ei müüda (laost otsas või eemaldatud) */
  unavailableIds: string[];
  subtotalCents: number;
  /** Sooduskoodi tulemus (null, kui koodi ei sisestatud) */
  discount: PublicDiscountResult | null;
  discountCents: number;
  /** Toodete summa pärast soodustust (ilma transpordita), ≥ 0 */
  totalCents: number;
  shippingFromCents: number | null;
  /** Kõigi ridade tarneaegade koond; null, kui mõnel real tarneaeg puudub */
  delivery: { minDays: number; maxDays: number } | null;
}

function combinedDelivery(lines: ResolvedCartLine[]): ResolvedCart["delivery"] {
  const deliveries = lines.map((line) => line.item.variant.delivery);
  if (deliveries.length === 0 || deliveries.some((d) => d === null)) return null;
  return {
    minDays: Math.max(...deliveries.map((d) => d!.minDays)),
    maxDays: Math.max(...deliveries.map((d) => d!.maxDays)),
  };
}

const discountCodeSchema = z.string().max(100);

async function resolveDiscount(code: string, lines: ResolvedCartLine[]): Promise<PublicDiscountResult> {
  const display = code.trim().slice(0, 40);
  if (!isDatabaseConfigured()) {
    return { valid: false, code: display, eligibleSubtotalCents: 0, discountAmountCents: 0, freeShipping: false, reason: "NOT_FOUND", message: "Sooduskoodi ei leitud." };
  }
  try {
    const priced: PricedCartLine[] = lines.map(({ item, quantity }) => ({
      sku: item.variant.sku,
      productSlug: item.product.slug,
      manufacturer: item.product.brand,
      unitPriceCents: item.variant.price.saleCents,
      quantity,
    }));
    return await evaluateCartDiscount(getDb(), { code, lines: priced, ip: (await getClientMeta()).ip });
  } catch (error) {
    // Kliendile ei näidata sisemist viga — ainult üldine teade; detail läheb logisse
    const errorId = newErrorId();
    await writeSystemLog({ level: "ERROR", source: "APPLICATION", message: "Sooduskoodi kontroll ebaõnnestus", details: { reason: errorMessage(error) }, errorId });
    return { valid: false, code: display, eligibleSubtotalCents: 0, discountAmountCents: 0, freeShipping: false, reason: "ERROR", message: "Sooduskoodi ei õnnestunud praegu kontrollida. Proovi hiljem uuesti." };
  }
}

/**
 * @param discountCode — AINULT koodi tekst. Korraga saab kasutada ühte koodi (üks string, mitte massiiv).
 */
export async function resolveCart(input: unknown, discountCode?: unknown): Promise<ResolvedCart> {
  const parsed = cartInputSchema.safeParse(input);
  const refs = parsed.success ? parsed.data : [];
  const items = await getItemsByVariantIds(refs.map((ref) => ref.variantId));
  const byId = new Map(items.map((item) => [item.variant.id, item]));

  const lines: ResolvedCartLine[] = [];
  const unavailableIds: string[] = [];
  for (const ref of refs) {
    const item = byId.get(ref.variantId);
    if (!item || item.variant.stock.quantity < 1) {
      unavailableIds.push(ref.variantId);
      continue;
    }
    const maxQuantity = Math.min(item.variant.stock.quantity, 10);
    const quantity = Math.min(ref.quantity, maxQuantity);
    lines.push({ item, quantity, maxQuantity, lineTotalCents: item.variant.price.saleCents * quantity });
  }

  const shippingPrices = storeConfig.shippingMethods.map((m) => m.priceCents);
  const subtotalCents = lines.reduce((sum, line) => sum + line.lineTotalCents, 0);
  const code = discountCodeSchema.safeParse(discountCode);
  const discount = code.success && code.data.trim() && lines.length ? await resolveDiscount(code.data, lines) : null;
  const discountCents = discount?.valid ? Math.min(discount.discountAmountCents, subtotalCents) : 0;
  return {
    lines,
    unavailableIds,
    subtotalCents,
    discount,
    discountCents,
    totalCents: Math.max(0, subtotalCents - discountCents),
    shippingFromCents: shippingPrices.length ? Math.min(...shippingPrices) : null,
    delivery: combinedDelivery(lines),
  };
}

const compareInputSchema = z.array(z.string().min(1).max(100)).max(4);

export async function resolveCompare(input: unknown): Promise<CatalogItem[]> {
  const parsed = compareInputSchema.safeParse(input);
  return parsed.success ? getItemsByVariantIds(parsed.data) : [];
}

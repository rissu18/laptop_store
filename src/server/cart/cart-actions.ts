"use server";

import { z } from "zod";
import { storeConfig } from "@/config/store";
import type { CatalogItem } from "@/domain/catalog/types";
import { getItemsByVariantIds } from "@/server/catalog/catalog-service";

/**
 * Ostukorvi ja võrdluse serveripoolne arvutus.
 * Brauser saadab AINULT toote ID-d ja kogused. Hinnad, laoseis ja summad arvutatakse siin.
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
  shippingFromCents: number | null;
  delivery: { minDays: number; maxDays: number };
}

export async function resolveCart(input: unknown): Promise<ResolvedCart> {
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
  return {
    lines,
    unavailableIds,
    subtotalCents: lines.reduce((sum, line) => sum + line.lineTotalCents, 0),
    shippingFromCents: shippingPrices.length ? Math.min(...shippingPrices) : null,
    delivery: storeConfig.delivery,
  };
}

const compareInputSchema = z.array(z.string().min(1).max(100)).max(4);

export async function resolveCompare(input: unknown): Promise<CatalogItem[]> {
  const parsed = compareInputSchema.safeParse(input);
  return parsed.success ? getItemsByVariantIds(parsed.data) : [];
}

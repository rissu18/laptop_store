import type { FoxwayFeedInput } from "./foxway-snapshot";
import { FOXWAY_FEEDS, type FoxwayFeedKey, type FoxwayLine } from "./foxway-schema";

/**
 * Testide Foxway read (päris feedi kujul 2026-10-12, aga fiktiivsed SKU-d). Väärtused on päris feedist tuttavad.
 */

export interface FoxwayLineInput {
  sku?: string | null;
  name?: string | null;
  itemVariantId?: number;
  itemGroupId?: number;
  quantity?: number | null;
  price?: number | null;
  currency?: string | null;
  vatMargin?: boolean;
  mpn?: string | null;
  dims?: Partial<Record<string, string | null>>;
}

const DEFAULT_DIMS: Record<string, string | null> = {
  Color: "Black",
  Appearance: "Grade B",
  Functionality: "Working",
  Boxed: "Charger included",
  "CPU Laptops": "Core i5-1145G7",
  RAM: "16GB",
  Drive: "256GB SSD",
  "Battery status": "Holds Charge",
  Keyboard: "SCA",
  COA: "Windows",
  "LCD Graphics array": "FHD (1920x1080)",
  "GPU laptops": "Integrated",
};

export function foxwayLine(input: FoxwayLineInput = {}): FoxwayLine {
  const dims = { ...DEFAULT_DIMS, ...input.dims };
  return {
    ProductName: input.name === undefined ? 'Dell Latitude 5420 14"' : input.name,
    ItemVariantId: input.itemVariantId ?? 50001,
    ItemGroupId: input.itemGroupId ?? 12,
    ItemGroupName: (input.itemGroupId ?? 12) === 54 ? "Mac Laptops" : "PC Laptops",
    IsVatMargin: input.vatMargin ?? false,
    DimensionGroupId: 11,
    DimensionGroupName: "Laptops",
    Quantity: input.quantity === undefined ? 3 : input.quantity,
    Price: input.price === undefined ? 300 : input.price,
    CurrencyIsoCode: input.currency === undefined ? "EUR" : input.currency,
    SKU: input.sku === undefined ? "01209999900001" : input.sku,
    Dimension: Object.entries(dims)
      .filter(([, v]) => v !== null && v !== undefined)
      .map(([Key, Value]) => ({ Key, Value })),
    Ean: null,
    Mpn: input.mpn ?? null,
  };
}

export const MAC_DIMS = {
  Color: "Space Gray",
  Boxed: "Unboxed",
  "CPU Laptops": "Apple M1",
  RAM: "8GB",
  Drive: "256GB SSD",
  COA: "macOS",
  "LCD Graphics array": "Retina",
  Keyboard: "DEU",
};

/** Kõik neli feed'i (puuduvad → tühi massiiv, nagu päris "new · PC") */
export function foxwayFeeds(lines: Partial<Record<FoxwayFeedKey, FoxwayLine[]>>): FoxwayFeedInput[] {
  return FOXWAY_FEEDS.map((feed) => ({ feed, pricelist: { lines: lines[feed.key] ?? [], invalid: [] } }));
}

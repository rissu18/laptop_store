import { z } from "zod";

/**
 * Foxway API vastuste valideerimine (Swagger: PricelistLine). Ei eeldata, et iga väli või Dimension võti on alati
 * olemas — puuduv väärtus jääb null-iks. Rea tasemel vead ei kukuta kogu snapshot'i (rida jäetakse vahele + logi);
 * vastuse tasemel viga (mitte massiiv) → snapshot pole usaldusväärne (FoxwaySourceError).
 */

/** Laptops (DimensionGroup 11): PC Laptops 12, Mac Laptops 54. Chromebooks (141) praegu EI impordita. */
export const FOXWAY_LAPTOP_DIMENSION_GROUP = 11;
export const FOXWAY_ITEM_GROUPS = { pc: 12, mac: 54 } as const;

/** Kõik neli päringut peavad õnnestuma, enne kui snapshot'i põhjal midagi maha võetakse. */
export const FOXWAY_FEEDS = [
  { key: "workingPc", catalog: "working", itemGroupId: FOXWAY_ITEM_GROUPS.pc, label: "Working · PC Laptops" },
  { key: "workingMac", catalog: "working", itemGroupId: FOXWAY_ITEM_GROUPS.mac, label: "Working · Mac Laptops" },
  { key: "newPc", catalog: "new", itemGroupId: FOXWAY_ITEM_GROUPS.pc, label: "Brand New · PC Laptops" },
  { key: "newMac", catalog: "new", itemGroupId: FOXWAY_ITEM_GROUPS.mac, label: "Brand New · Mac Laptops" },
] as const;
export type FoxwayFeed = (typeof FOXWAY_FEEDS)[number];
export type FoxwayFeedKey = FoxwayFeed["key"];
export type FoxwayCatalogSlug = FoxwayFeed["catalog"];

const nullableText = z.preprocess((v) => (typeof v === "string" ? (v.trim() === "" ? null : v.trim()) : v), z.string().nullable().optional());

export const foxwayDimensionSchema = z.object({
  Key: nullableText,
  // Swagger: Value võib olla mis tahes tüüpi — teisendame tekstiks, muu jääb null-iks
  Value: z.unknown().optional(),
});

export const foxwayLineSchema = z.object({
  ProductName: nullableText,
  ItemVariantId: z.number().int().nullable().optional(),
  ItemGroupId: z.number().int().nullable().optional(),
  ItemGroupName: nullableText,
  IsVatMargin: z.boolean().nullable().optional(),
  DimensionGroupId: z.number().int().nullable().optional(),
  DimensionGroupName: nullableText,
  Quantity: z.number().nullable().optional(),
  Price: z.number().nullable().optional(),
  CurrencyIsoCode: nullableText,
  SKU: z.preprocess((v) => (typeof v === "number" ? String(v) : v), nullableText),
  Dimension: z.array(foxwayDimensionSchema).nullable().optional(),
  Ean: nullableText,
  Mpn: nullableText,
});
export type FoxwayLine = z.infer<typeof foxwayLineSchema>;

/** Vastus peab olema massiiv; iga element valideeritakse eraldi (vt parseFoxwayPricelist). */
export const foxwayPricelistSchema = z.array(z.unknown());

export interface ParsedPricelist {
  lines: FoxwayLine[];
  /** Read, mis ei vastanud skeemile (indeks + lühike põhjus) */
  invalid: { index: number; sku: string | null; reason: string }[];
}

/** JSON (juba parsitud) → read. Viskab, kui vastus pole massiiv (kogu vastus on vigane). */
export function parseFoxwayPricelist(json: unknown): ParsedPricelist {
  const array = foxwayPricelistSchema.parse(json);
  const lines: FoxwayLine[] = [];
  const invalid: ParsedPricelist["invalid"] = [];
  array.forEach((item, index) => {
    const result = foxwayLineSchema.safeParse(item);
    if (result.success) lines.push(result.data);
    else {
      const sku = item && typeof item === "object" && "SKU" in item && (typeof item.SKU === "string" || typeof item.SKU === "number") ? String(item.SKU) : null;
      invalid.push({ index, sku, reason: result.error.issues.map((i) => `${i.path.join(".") || "rida"}: ${i.message}`).join("; ").slice(0, 300) });
    }
  });
  return { lines, invalid };
}

/** Dimension[] → { Key: tekst } (tühjad/mittetekstilised väärtused → null; võtmed täpselt Foxway kujul) */
export function dimensionMap(line: Pick<FoxwayLine, "Dimension">): Record<string, string | null> {
  const map: Record<string, string | null> = {};
  for (const dim of line.Dimension ?? []) {
    if (!dim.Key) continue;
    const value = dim.Value;
    const text = typeof value === "string" ? value.replace(/\s+/g, " ").trim() : typeof value === "number" || typeof value === "boolean" ? String(value) : null;
    map[dim.Key] = text ? text : null;
  }
  return map;
}

/** Foxway Dimension võtmed (päris feedis 2026-10-12) */
export const FOXWAY_DIMENSION_KEYS = {
  color: "Color",
  appearance: "Appearance",
  functionality: "Functionality",
  boxed: "Boxed",
  cpu: "CPU Laptops",
  ram: "RAM",
  drive: "Drive",
  battery: "Battery status",
  keyboard: "Keyboard",
  coa: "COA",
  lcd: "LCD Graphics array",
  gpu: "GPU laptops",
  faultPrimary: "PC Fault Descriptions",
  faultAdditional: "PC Additional Fault",
} as const;

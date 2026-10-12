import { z } from "zod";

/**
 * Foxway pakkumise admini/hanke metaandmed (supplier_listings.raw_data.foxway, kirjutab foxway-sync.ts →
 * foxwayRawData). Loevad AINULT admin (konfiguratsiooni leht) ja tellimuse hanke snapshot — pood mitte.
 * Vana/puudulik kuju → null (ei kuku).
 */
const metaSchema = z.object({
  sku: z.string(),
  itemVariantId: z.string().nullable().optional(),
  productName: z.string().nullable().optional(),
  catalogs: z.array(z.string()).optional(),
  canonicalCatalog: z.string().nullable().optional(),
  quantity: z.number().nullable().optional(),
  sourcePriceCents: z.number().nullable().optional(),
  currency: z.string().nullable().optional(),
  isVatMargin: z.boolean().nullable().optional(),
  mpn: z.string().nullable().optional(),
  appearance: z.string().nullable().optional(),
  functionality: z.string().nullable().optional(),
  boxed: z.string().nullable().optional(),
  keyboard: z.string().nullable().optional(),
  batteryStatus: z.string().nullable().optional(),
  faultPrimary: z.string().nullable().optional(),
  faultAdditional: z.string().nullable().optional(),
  faultSeverity: z.string().nullable().optional(),
  faults: z.array(z.object({ raw: z.string(), severity: z.string(), known: z.boolean(), reason: z.string() })).optional(),
  color: z.string().nullable().optional(),
  coa: z.string().nullable().optional(),
  lcd: z.string().nullable().optional(),
  gpu: z.string().nullable().optional(),
  drive: z.string().nullable().optional(),
  charger: z.object({ profile: z.string(), surchargeCents: z.number(), reason: z.string() }).nullable().optional(),
  pricing: z
    .object({ supplierPriceCents: z.number(), vatCents: z.number(), vatRateBps: z.number(), markupCents: z.number(), chargerCents: z.number(), salePriceCents: z.number(), costCents: z.number() })
    .nullable()
    .optional(),
  hold: z.string().nullable().optional(),
  holdReasons: z.array(z.string()).optional(),
});
export type FoxwayListingMeta = z.infer<typeof metaSchema>;

export function foxwayMetaOf(rawData: unknown): FoxwayListingMeta | null {
  if (!rawData || typeof rawData !== "object" || !("foxway" in rawData)) return null;
  const parsed = metaSchema.safeParse((rawData as { foxway: unknown }).foxway);
  return parsed.success ? parsed.data : null;
}

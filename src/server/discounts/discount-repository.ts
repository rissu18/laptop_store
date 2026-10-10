import { eq, inArray } from "drizzle-orm";
import type { DiscountRule } from "@/domain/discounts/discount-engine";
import { effectiveListing } from "@/server/catalog/db-catalog-mapper";
import type { Database } from "@/server/db/client";
import {
  discountCodes,
  discountManufacturers,
  discountProductModels,
  discountSupplierListings,
  productModels,
  supplierListings,
} from "@/server/db/schema";

type Reader = Pick<Database, "select">;
export type DiscountRow = typeof discountCodes.$inferSelect;

export interface DiscountTargets {
  manufacturers: string[];
  includedModelIds: string[];
  excludedModelIds: string[];
  includedListingIds: string[];
  excludedListingIds: string[];
}

export async function loadDiscountTargets(db: Reader, discountId: string): Promise<DiscountTargets> {
  const [manufacturers, models, listings] = await Promise.all([
    db.select().from(discountManufacturers).where(eq(discountManufacturers.discountCodeId, discountId)),
    db.select().from(discountProductModels).where(eq(discountProductModels.discountCodeId, discountId)),
    db.select().from(discountSupplierListings).where(eq(discountSupplierListings.discountCodeId, discountId)),
  ]);
  return {
    manufacturers: manufacturers.map((m) => m.manufacturer).sort(),
    includedModelIds: models.filter((m) => m.mode === "INCLUDE").map((m) => m.productModelId),
    excludedModelIds: models.filter((m) => m.mode === "EXCLUDE").map((m) => m.productModelId),
    includedListingIds: listings.filter((l) => l.mode === "INCLUDE").map((l) => l.supplierListingId),
    excludedListingIds: listings.filter((l) => l.mode === "EXCLUDE").map((l) => l.supplierListingId),
  };
}

/**
 * Andmebaasi rida + seosed → DiscountEngine'i reegel. Mudelid ja pakkumised teisendatakse
 * stabiilseteks võtmeteks (mudeli slug, pakkumise SKU), mida tunneb ka poe ostukorv.
 */
export async function toDiscountRule(db: Reader, row: DiscountRow, targets?: DiscountTargets): Promise<DiscountRule> {
  const t = targets ?? (await loadDiscountTargets(db, row.id));
  const modelIds = [...t.includedModelIds, ...t.excludedModelIds];
  const listingIds = [...t.includedListingIds, ...t.excludedListingIds];
  const [models, listings] = await Promise.all([
    modelIds.length ? db.select({ id: productModels.id, slug: productModels.slug }).from(productModels).where(inArray(productModels.id, modelIds)) : [],
    listingIds.length ? db.select({ id: supplierListings.id, sku: supplierListings.sku }).from(supplierListings).where(inArray(supplierListings.id, listingIds)) : [],
  ]);
  const slug = new Map(models.map((m) => [m.id, m.slug]));
  const sku = new Map(listings.map((l) => [l.id, l.sku]));
  const slugs = (ids: string[]) => ids.flatMap((id) => (slug.has(id) ? [slug.get(id)!] : []));
  const skus = (ids: string[]) => ids.flatMap((id) => (sku.has(id) ? [sku.get(id)!] : []));

  return {
    code: row.code,
    normalizedCode: row.normalizedCode,
    type: row.type,
    value: row.value,
    status: row.status,
    startsAt: row.startsAt,
    expiresAt: row.expiresAt,
    minimumSubtotalCents: row.minimumSubtotalCents,
    maximumDiscountCents: row.maximumDiscountCents,
    usageLimit: row.usageLimit,
    usageCount: row.usageCount,
    scope: row.scope,
    manufacturers: t.manufacturers,
    productModels: slugs(t.includedModelIds),
    listings: skus(t.includedListingIds),
    excludedProductModels: slugs(t.excludedModelIds),
    excludedListings: skus(t.excludedListingIds),
    respectMinimumMargin: row.respectMinimumMargin,
  };
}

export async function findDiscountByNormalizedCode(db: Reader, normalizedCode: string): Promise<DiscountRow | null> {
  const [row] = await db.select().from(discountCodes).where(eq(discountCodes.normalizedCode, normalizedCode)).limit(1);
  return row ?? null;
}

/** Pakkumiste ostuhind ja käibemaksurežiim SKU järgi (efektiivsed väärtused) — marginaalikaitse jaoks. */
export async function loadListingCosts(db: Reader, skus: string[]): Promise<Map<string, { costCents: number | null; vatScheme: string | null }>> {
  if (!skus.length) return new Map();
  const rows = await db.select().from(supplierListings).where(inArray(supplierListings.sku, skus));
  return new Map(
    rows.map((row) => {
      const listing = effectiveListing(row);
      return [listing.sku, { costCents: listing.supplierPriceCents, vatScheme: listing.vatScheme }];
    }),
  );
}

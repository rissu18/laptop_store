import "server-only";
import { inArray, notInArray, sql, type AnyColumn, type SQL } from "drizzle-orm";
import { cache } from "react";
import { explainVisibility } from "@/domain/admin/visibility";
import { deliveryFilterLabel, deliveryFilterValue } from "@/domain/catalog/facets";
import { roundToEuro } from "@/domain/money/money";
import { requireAdmin } from "@/server/auth/auth";
import { queryStorefrontCatalogRows } from "@/server/catalog/db-catalog";
import { effectiveModel, mapCatalogRows, storefrontVisibility, type StorefrontVisibility } from "@/server/catalog/db-catalog-mapper";
import { getDb, type Database } from "@/server/db/client";

/**
 * Admini skoop "Müügis" = täpselt need pakkumised, mida pood näitab. Arvutatakse poe enda lugemisteest
 * (queryStorefrontCatalogRows → storefrontVisibility → mapCatalogRows koondgalerii), mitte paralleelse SQL-reegliga:
 * ACTIVE mudel + ACTIVE pakkumine, saadavus (availability.ts), quality_hold (nt Foxway Grade C / rike) ja poe
 * kohustuslikud väljad. Mudel on müügis, kui tal on vähemalt üks poes nähtav pakkumine.
 */

export type CatalogScope = "sellable" | "all";

export interface SellableSnapshot {
  listingIds: string[];
  modelIds: string[];
  /** Poes nähtavaid pakkumisi tarnija koodi kaupa */
  bySupplier: Record<string, number>;
  /** Poes nähtavaid pakkumisi mudeli kaupa */
  sellableCountByModel: Map<string, number>;
  /** Poe koondgalerii piltide arv mudeli kaupa (sama, mida tooteleht näitab) */
  galleryByModel: Map<string, number>;
  /** Kliendihind (täiseurod, nagu poes) mudeli kaupa: odavaim nähtav pakkumine */
  minCustomerPriceByModel: Map<string, number>;
  /** Kõigi nähtavate pakkumiste kliendihinnad (täiseurod) */
  customerPrices: number[];
}

export function buildSellableSnapshot(rows: Awaited<ReturnType<typeof queryStorefrontCatalogRows>>): SellableSnapshot {
  const modelById = new Map(rows.models.map((model) => [model.id, effectiveModel(model)]));
  const listingIds: string[] = [];
  const modelIds = new Set<string>();
  const bySupplier: Record<string, number> = {};
  const minCustomerPriceByModel = new Map<string, number>();
  const sellableCountByModel = new Map<string, number>();
  const customerPrices: number[] = [];
  for (const raw of rows.listings) {
    const model = modelById.get(raw.productModelId);
    if (!model) continue;
    const visibility = storefrontVisibility(model, raw);
    if (!visibility.visible) continue;
    listingIds.push(raw.id);
    modelIds.add(model.id);
    sellableCountByModel.set(model.id, (sellableCountByModel.get(model.id) ?? 0) + 1);
    bySupplier[raw.supplier] = (bySupplier[raw.supplier] ?? 0) + 1;
    const price = roundToEuro(visibility.listing.salePriceCents!);
    customerPrices.push(price);
    minCustomerPriceByModel.set(model.id, Math.min(price, minCustomerPriceByModel.get(model.id) ?? Number.POSITIVE_INFINITY));
  }
  const modelIdBySlug = new Map(rows.models.map((model) => [model.slug, model.id]));
  const galleryByModel = new Map<string, number>();
  for (const { product } of mapCatalogRows(rows.models, rows.listings, rows.images, rows.unitImages).items) {
    const id = modelIdBySlug.get(product.slug);
    if (id) galleryByModel.set(id, product.images.length);
  }
  return { listingIds, modelIds: [...modelIds], bySupplier, sellableCountByModel, galleryByModel, minCustomerPriceByModel, customerPrices };
}

export async function loadSellableSnapshot(db: Pick<Database, "select">): Promise<SellableSnapshot> {
  return buildSellableSnapshot(await queryStorefrontCatalogRows(db));
}

/** Ühe päringu (lehe renderduse) jooksul arvutatakse snapshot üks kord. */
export const getSellableSnapshot = cache(async (): Promise<SellableSnapshot> => {
  await requireAdmin();
  return loadSellableSnapshot(getDb());
});

/**
 * Ühe pakkumise poe nähtavus adminile: otsus (storefrontVisibility) + selgitus + kliendile kuvatav tarne
 * ("Poes kohapeal" / "Tarne 2–4 päeva") — sama reegel mis poe filtril "Tarne".
 */
export function describeVisibility(
  raw: { status: string; qualityHoldReason: string | null; manualOverrides: unknown; deliveryMinDays: number | null; deliveryMaxDays: number | null },
  model: { status: string },
  visibility: StorefrontVisibility,
) {
  const holdFromAdmin = typeof raw.manualOverrides === "object" && raw.manualOverrides !== null && "qualityHold" in raw.manualOverrides;
  const reason = explainVisibility({
    blockedBy: visibility.blockedBy,
    listingStatus: raw.status,
    modelStatus: model.status,
    qualityHold: visibility.qualityHold,
    qualityHoldReason: raw.qualityHoldReason,
    holdFromAdmin,
    available: visibility.listing.available,
    stock: visibility.listing.stock,
    missing: visibility.missing,
  });
  const delivery = raw.deliveryMinDays !== null && raw.deliveryMaxDays !== null ? { minDays: raw.deliveryMinDays, maxDays: raw.deliveryMaxDays } : null;
  const deliveryValue = deliveryFilterValue({ stock: visibility.stock, delivery });
  return {
    visible: visibility.visible,
    checks: visibility.checks,
    reason,
    deliveryLabel: deliveryValue ? deliveryFilterLabel(deliveryValue) : null,
    /** Teadmata kogus (Laptopid.ee) — ei kuvata "1 tk" */
    quantityUnknown: visibility.stock.available && visibility.stock.quantity === null,
  };
}

/** `column IN (ids)`; tühi hulk → false (mitte vigane SQL). */
export const idIn = (column: AnyColumn, ids: string[]): SQL => (ids.length ? inArray(column, ids) : sql`false`);
/** `column NOT IN (ids)`; tühi hulk → true. */
export const idNotIn = (column: AnyColumn, ids: string[]): SQL => (ids.length ? notInArray(column, ids) : sql`true`);

import "server-only";
import { and, asc, count, desc, eq, ilike, isNull, or, sql, type AnyColumn, type SQL } from "drizzle-orm";
import type { LISTING_OVERRIDABLE_FIELDS } from "@/domain/catalog/overrides";
import type { ListingIssue, ModelIssue } from "@/domain/admin/data-quality-rules";
import { effectiveListing, effectiveModel } from "@/server/catalog/db-catalog-mapper";
import { requireAdmin } from "@/server/auth/auth";
import { getDb } from "@/server/db/client";
import { icecatMetadata, listingImages, productIdentifiers, productImages, productModels, supplierInventoryUnits, supplierListings } from "@/server/db/schema";

/**
 * Admini andmepäringud tootekataloogi jaoks. Iga eksporditud funktsioon kontrollib ise admini
 * sessiooni (Data Access Layer) — andmed ei lekiks ka siis, kui mõni leht unustaks kontrolli.
 */

export const ADMIN_PAGE_SIZE = 25;

/** Efektiivne väärtus SQL-is: admini parandus (manual_overrides JSONB) või tarnija veerg. */
function effectiveSql(overrides: AnyColumn, column: AnyColumn, field: string): SQL {
  return sql`(CASE WHEN ${overrides} ? ${field} THEN ${overrides}->>${field} ELSE (${column})::text END)`;
}
const listingEff = (field: (typeof LISTING_OVERRIDABLE_FIELDS)[number]) =>
  effectiveSql(supplierListings.manualOverrides, supplierListings[field] as AnyColumn, field);

/** = data-quality-rules.ts → keyboardReportedMissing (keyboard.ts MISSING_PATTERN): tarnija teatas "Missing Keyboard" */
const KEYBOARD_REPORTED_MISSING = sql`(COALESCE(${supplierListings.rawData}->'foxway'->>'keyboard', ${supplierListings.details}->>'keyboardRaw', '') ~* '^\s*((missing|no|without)\s*keyboard|keyboard\s*missing)\s*$')`;

export function listingIssueCondition(issue: ListingIssue): SQL {
  switch (issue) {
    case "missing-cpu":
      return sql`${listingEff("cpu")} IS NULL`;
    case "missing-cpu-gen":
      return sql`${listingEff("cpuGeneration")} IS NULL`;
    case "missing-ram":
      return sql`${listingEff("ramGb")} IS NULL`;
    case "missing-ssd":
      return sql`${listingEff("storageGb")} IS NULL`;
    case "missing-grade":
      return sql`${listingEff("grade")} IS NULL`;
    case "unknown-keyboard":
      return sql`${listingEff("keyboard")} IS NULL AND NOT ${KEYBOARD_REPORTED_MISSING}`;
    case "missing-keyboard":
      return sql`${listingEff("keyboard")} IS NULL AND ${KEYBOARD_REPORTED_MISSING}`;
    case "missing-sale-price":
      return isNull(supplierListings.salePriceCents);
    case "missing-stock":
      // Saadavusega tarnija (available true/false, kogus teadmata) ei ole "puuduv laoseis"
      return sql`${listingEff("stock")} IS NULL AND ${supplierListings.available} IS NULL`;
  }
}

const visibleImageCount = sql<number>`(SELECT count(*)::int FROM ${productImages} WHERE ${productImages.productModelId} = ${productModels.id} AND NOT ${productImages.isHidden})`;

export function modelIssueCondition(issue: ModelIssue): SQL {
  switch (issue) {
    case "no-images":
      // Efektiivne (sama mis pood): mudelipildid VÕI mõne müügis pakkumise oma fotod (Laptopid.ee)
      return sql`${visibleImageCount} = 0 AND NOT EXISTS (SELECT 1 FROM ${listingImages} li JOIN ${supplierListings} sl ON sl.id = li.supplier_listing_id WHERE sl.product_model_id = ${productModels.id} AND NOT li.is_hidden AND sl.status = 'ACTIVE' AND sl.available IS NOT FALSE)`;
    case "images-review":
      return sql`${productModels.enrichment}->'images'->>'status' = 'REVIEW'`;
    case "icecat-not-found":
      return sql`EXISTS (SELECT 1 FROM ${icecatMetadata} WHERE ${icecatMetadata.productModelId} = ${productModels.id} AND ${icecatMetadata.status} = 'NOT_FOUND')`;
    case "icecat-needs-review":
      return sql`EXISTS (SELECT 1 FROM ${icecatMetadata} WHERE ${icecatMetadata.productModelId} = ${productModels.id} AND ${icecatMetadata.status} = 'NEEDS_REVIEW')`;
  }
}

const escapeLike = (value: string) => value.replace(/[\\%_]/g, (c) => `\\${c}`);

// ---------------------------------------------------------------------------
// Mudelid
// ---------------------------------------------------------------------------

export interface ModelListFilters {
  q?: string;
  status?: string;
  brand?: string;
  featured?: "yes" | "no";
  issue?: ModelIssue;
  sort?: "name" | "updated" | "listings";
  page: number;
}

export async function listModels(filters: ModelListFilters) {
  await requireAdmin();
  const db = getDb();
  const conditions: SQL[] = [];
  if (filters.q) {
    const like = `%${escapeLike(filters.q)}%`;
    conditions.push(or(ilike(productModels.slug, like), ilike(productModels.family, like), ilike(productModels.model, like), sql`${effectiveSql(productModels.manualOverrides, productModels.model, "model")} ILIKE ${like}`)!);
  }
  if (filters.status) conditions.push(eq(productModels.status, filters.status as "ACTIVE"));
  if (filters.brand) conditions.push(sql`${effectiveSql(productModels.manualOverrides, productModels.manufacturer, "manufacturer")} = ${filters.brand}`);
  if (filters.featured) conditions.push(eq(productModels.featured, filters.featured === "yes"));
  if (filters.issue) conditions.push(modelIssueCondition(filters.issue));
  const where = conditions.length ? and(...conditions) : undefined;

  const listingCount = sql<number>`(SELECT count(*)::int FROM ${supplierListings} WHERE ${supplierListings.productModelId} = ${productModels.id})`;
  const activeListingCount = sql<number>`(SELECT count(*)::int FROM ${supplierListings} WHERE ${supplierListings.productModelId} = ${productModels.id} AND ${supplierListings.status} = 'ACTIVE')`;
  const minPrice = sql<number | null>`(SELECT min(${supplierListings.salePriceCents})::int FROM ${supplierListings} WHERE ${supplierListings.productModelId} = ${productModels.id} AND ${supplierListings.status} = 'ACTIVE')`;
  const order =
    filters.sort === "updated" ? [desc(productModels.updatedAt)] : filters.sort === "listings" ? [desc(listingCount), asc(productModels.slug)] : [asc(productModels.manufacturer), asc(productModels.family), asc(productModels.model)];

  const [rows, [{ total }]] = await Promise.all([
    db
      .select({
        model: productModels,
        listingCount,
        activeListingCount,
        imageCount: visibleImageCount,
        minPrice,
        icecatStatus: icecatMetadata.status,
      })
      .from(productModels)
      .leftJoin(icecatMetadata, eq(icecatMetadata.productModelId, productModels.id))
      .where(where)
      .orderBy(...order)
      .limit(ADMIN_PAGE_SIZE)
      .offset((filters.page - 1) * ADMIN_PAGE_SIZE),
    db.select({ total: count() }).from(productModels).where(where),
  ]);
  return {
    rows: rows.map((row) => ({ ...row, model: effectiveModel(row.model) })),
    total,
    pageCount: Math.max(1, Math.ceil(total / ADMIN_PAGE_SIZE)),
  };
}

export async function getModelDetail(id: string) {
  await requireAdmin();
  const db = getDb();
  const [model] = await db.select().from(productModels).where(eq(productModels.id, id)).limit(1);
  if (!model) return null;
  const [identifiers, icecat, listings, images] = await Promise.all([
    db.select().from(productIdentifiers).where(eq(productIdentifiers.productModelId, id)).orderBy(asc(productIdentifiers.kind), asc(productIdentifiers.value)),
    db.select().from(icecatMetadata).where(eq(icecatMetadata.productModelId, id)).limit(1),
    db.select().from(supplierListings).where(eq(supplierListings.productModelId, id)).orderBy(asc(supplierListings.sku)),
    db.select().from(productImages).where(eq(productImages.productModelId, id)).orderBy(asc(productImages.position)),
  ]);
  return {
    supplier: model,
    effective: effectiveModel(model),
    overrides: (model.manualOverrides ?? {}) as Record<string, unknown>,
    identifiers,
    icecat: icecat[0] ?? null,
    listings: listings.map((listing) => ({ raw: listing, effective: effectiveListing(listing) })),
    images,
  };
}

// ---------------------------------------------------------------------------
// Konfiguratsioonid (tarnija pakkumised)
// ---------------------------------------------------------------------------

export interface ListingListFilters {
  q?: string;
  status?: string;
  grade?: string;
  model?: string;
  issue?: ListingIssue;
  supplier?: string;
  /** Tarnija kvaliteedi kinnipidamine (efektiivne): "REVIEW" | "BLOCKED" | "none" */
  hold?: "REVIEW" | "BLOCKED" | "none";
  sort?: "sku" | "price-asc" | "price-desc" | "stock" | "updated";
  page: number;
}

export async function listListings(filters: ListingListFilters) {
  await requireAdmin();
  const db = getDb();
  const conditions: SQL[] = [];
  if (filters.q) {
    const like = `%${escapeLike(filters.q)}%`;
    conditions.push(
      or(
        ilike(supplierListings.sku, like),
        ilike(supplierListings.supplierSku, like),
        sql`${listingEff("cpu")} ILIKE ${like}`,
        ilike(productModels.model, like),
        ilike(productModels.family, like),
      )!,
    );
  }
  if (filters.status) conditions.push(eq(supplierListings.status, filters.status as "ACTIVE"));
  if (filters.grade) conditions.push(sql`${listingEff("grade")} = ${filters.grade}`);
  if (filters.model) conditions.push(eq(supplierListings.productModelId, filters.model));
  if (filters.issue) conditions.push(listingIssueCondition(filters.issue));
  if (filters.supplier) conditions.push(eq(supplierListings.supplier, filters.supplier));
  if (filters.hold === "none") conditions.push(sql`${listingEff("qualityHold")} IS NULL`);
  else if (filters.hold) conditions.push(sql`${listingEff("qualityHold")} = ${filters.hold}`);
  const where = conditions.length ? and(...conditions) : undefined;

  const order = {
    sku: [asc(supplierListings.sku)],
    "price-asc": [sql`${supplierListings.salePriceCents} ASC NULLS FIRST`],
    "price-desc": [sql`${supplierListings.salePriceCents} DESC NULLS LAST`],
    stock: [sql`(${listingEff("stock")})::int ASC NULLS FIRST`],
    updated: [desc(supplierListings.updatedAt)],
  }[filters.sort ?? "sku"];

  const [rows, [{ total }]] = await Promise.all([
    db
      .select({ listing: supplierListings, modelId: productModels.id, modelSlug: productModels.slug, modelFamily: productModels.family, modelName: productModels.model, modelOverrides: productModels.manualOverrides })
      .from(supplierListings)
      .innerJoin(productModels, eq(productModels.id, supplierListings.productModelId))
      .where(where)
      .orderBy(...order, asc(supplierListings.sku))
      .limit(ADMIN_PAGE_SIZE)
      .offset((filters.page - 1) * ADMIN_PAGE_SIZE),
    db.select({ total: count() }).from(supplierListings).innerJoin(productModels, eq(productModels.id, supplierListings.productModelId)).where(where),
  ]);
  return {
    rows: rows.map((row) => {
      const overrides = (row.modelOverrides ?? {}) as Record<string, unknown>;
      return {
        raw: row.listing,
        effective: effectiveListing(row.listing),
        modelId: row.modelId,
        modelLabel: `${(overrides.family as string) ?? row.modelFamily} ${(overrides.model as string) ?? row.modelName}`,
      };
    }),
    total,
    pageCount: Math.max(1, Math.ceil(total / ADMIN_PAGE_SIZE)),
  };
}

export async function getListingDetail(id: string) {
  await requireAdmin();
  const db = getDb();
  const [row] = await db
    .select({ listing: supplierListings, model: productModels })
    .from(supplierListings)
    .innerJoin(productModels, eq(productModels.id, supplierListings.productModelId))
    .where(eq(supplierListings.id, id))
    .limit(1);
  if (!row) return null;
  // Tarnija füüsilised seadmed (nt Tech: Tech ID + seerianumber) — ainult admin; müügis olevad eespool
  const units = await db
    .select({
      id: supplierInventoryUnits.id,
      externalUnitId: supplierInventoryUnits.externalUnitId,
      serialNumber: supplierInventoryUnits.serialNumber,
      available: supplierInventoryUnits.available,
      status: supplierInventoryUnits.status,
      excludedReason: supplierInventoryUnits.excludedReason,
      sourceSheet: supplierInventoryUnits.sourceSheet,
      sourceRow: supplierInventoryUnits.sourceRow,
      lastSeenAt: supplierInventoryUnits.lastSeenAt,
    })
    .from(supplierInventoryUnits)
    .where(eq(supplierInventoryUnits.supplierListingId, id))
    .orderBy(desc(supplierInventoryUnits.available), asc(supplierInventoryUnits.externalUnitId));
  return {
    supplier: row.listing,
    effective: effectiveListing(row.listing),
    overrides: (row.listing.manualOverrides ?? {}) as Record<string, unknown>,
    model: effectiveModel(row.model),
    units,
  };
}

/** Mudelite valik (nt filtrite jaoks). */
export async function listModelOptions() {
  await requireAdmin();
  const rows = await getDb().select().from(productModels).orderBy(asc(productModels.family), asc(productModels.model));
  return rows.map((row) => {
    const model = effectiveModel(row);
    return { id: model.id, label: `${model.family} ${model.model}` };
  });
}

import "server-only";
import { and, asc, count, desc, eq, ilike, isNull, or, sql, type AnyColumn, type SQL } from "drizzle-orm";
import type { LISTING_OVERRIDABLE_FIELDS } from "@/domain/catalog/overrides";
import { adminModelTitle } from "@/domain/admin/display";
import type { ListingIssue, ModelIssue } from "@/domain/admin/data-quality-rules";
import { effectiveListing, effectiveModel, storefrontVisibility } from "@/server/catalog/db-catalog-mapper";
import { requireAdmin } from "@/server/auth/auth";
import { getDb } from "@/server/db/client";
import { getSellableSnapshot, idIn, idNotIn, type SellableSnapshot } from "../sellable";
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
// NB: regulaaravaldis on SQL-parameeter — drizzle'i sql`` mall kaotab kaldkriipsud ("\s" → "s")
const KEYBOARD_REPORTED_MISSING = sql`(COALESCE(${supplierListings.rawData}->'foxway'->>'keyboard', ${supplierListings.details}->>'keyboardRaw', '') ~* ${String.raw`^\s*((missing|no|without)\s*keyboard|keyboard\s*missing)\s*$`})`;

/** = benchmarks.ts → parseBenchmark: positiivne arv (ka numbriline tekst "6 235" / "6235,5") kuni 1 000 000. NULL → false. */
const benchmarkOk = (text: SQL) =>
  sql`COALESCE((CASE WHEN (${text}) ~ ${String.raw`^\s*\d[\d\s]*([.,]\d+)?\s*$`} THEN replace(regexp_replace(${text}, ${String.raw`\s+`}, '', 'g'), ',', '.')::numeric END) BETWEEN 0.000001 AND 1000000, false)`;
/** = benchmarks.ts → validCpuMaxMhz: JSON number 400–7000 MHz. */
const maxMhzOk = (json: SQL) => sql`(CASE WHEN jsonb_typeof(${json}) = 'number' THEN (${json})::numeric BETWEEN 400 AND 7000 ELSE false END)`;
/** Admini jõudluse parandus (manual_overrides.<key>) võidab; muidu CPU/GPU nime parandus tühistab tarnija/rikastuse väärtuse. */
const performanceMissing = (component: "cpu" | "gpu", key: string, overrideOk: SQL, sourceOk: SQL) =>
  sql`(CASE WHEN ${supplierListings.manualOverrides} ? ${key} THEN NOT ${overrideOk} ELSE (${supplierListings.manualOverrides} ? ${component} OR NOT (${sourceOk})) END)`;
const mo = supplierListings.manualOverrides;
const d = supplierListings.details;
const e = supplierListings.enrichment;

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
    // = data-quality-rules.ts → performanceIssuesOf (benchmarks.ts → effectivePerformance)
    case "missing-cpu-benchmark":
      return performanceMissing("cpu", "cpuBenchmark", benchmarkOk(sql`${mo}->>'cpuBenchmark'`), sql`${benchmarkOk(sql`${d}->>'cpuBenchmark3dmark06'`)} OR ${benchmarkOk(sql`${e}->'cpuBenchmark'->>'value'`)}`);
    case "missing-gpu-benchmark":
      return performanceMissing("gpu", "gpuBenchmark", benchmarkOk(sql`${mo}->>'gpuBenchmark'`), sql`${benchmarkOk(sql`${d}->>'gpuBenchmark3dmark11'`)} OR ${benchmarkOk(sql`${e}->'gpuBenchmark'->>'value'`)}`);
    case "missing-cpu-max-mhz":
      return performanceMissing("cpu", "cpuMaxMhz", maxMhzOk(sql`${mo}->'cpuMaxMhz'`), sql`${maxMhzOk(sql`${d}->'cpuMaxMhz'`)} OR ${maxMhzOk(sql`${e}->'cpuMaxMhz'->'value'`)}`);
  }
}

const visibleImageCount = sql<number>`(SELECT count(*)::int FROM ${productImages} WHERE ${productImages.productModelId} = ${productModels.id} AND NOT ${productImages.isHidden})`;

/** Poe koondgalerii 1–4 pildiga mudelid (sama arvutus mis tootelehel; ainult müügis mudelitel on poe galerii). */
export function fewImageModelIds(snapshot: SellableSnapshot): string[] {
  return [...snapshot.galleryByModel].filter(([, n]) => n >= 1 && n <= 4).map(([id]) => id);
}

export function modelIssueCondition(issue: ModelIssue, snapshot: SellableSnapshot): SQL {
  switch (issue) {
    case "few-images":
      return idIn(productModels.id, fewImageModelIds(snapshot));
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
  /** Poes: müügis (vähemalt üks poes nähtav pakkumine) / ei müüda */
  scope?: "sellable" | "not-sellable";
  sort?: "name" | "updated" | "listings";
  page: number;
}

export async function listModels(filters: ModelListFilters) {
  await requireAdmin();
  const db = getDb();
  const snapshot = await getSellableSnapshot();
  const conditions: SQL[] = [];
  if (filters.q) {
    const like = `%${escapeLike(filters.q)}%`;
    conditions.push(or(ilike(productModels.slug, like), ilike(productModels.family, like), ilike(productModels.model, like), sql`${effectiveSql(productModels.manualOverrides, productModels.model, "model")} ILIKE ${like}`)!);
  }
  if (filters.status) conditions.push(eq(productModels.status, filters.status as "ACTIVE"));
  if (filters.brand) conditions.push(sql`${effectiveSql(productModels.manualOverrides, productModels.manufacturer, "manufacturer")} = ${filters.brand}`);
  if (filters.featured) conditions.push(eq(productModels.featured, filters.featured === "yes"));
  if (filters.issue) conditions.push(modelIssueCondition(filters.issue, snapshot));
  if (filters.scope === "sellable") conditions.push(idIn(productModels.id, snapshot.modelIds));
  if (filters.scope === "not-sellable") conditions.push(idNotIn(productModels.id, snapshot.modelIds));
  const where = conditions.length ? and(...conditions) : undefined;

  const listingCount = sql<number>`(SELECT count(*)::int FROM ${supplierListings} WHERE ${supplierListings.productModelId} = ${productModels.id})`;
  const order =
    filters.sort === "updated" ? [desc(productModels.updatedAt)] : filters.sort === "listings" ? [desc(listingCount), asc(productModels.slug)] : [asc(productModels.manufacturer), asc(productModels.family), asc(productModels.model)];

  const [rows, [{ total }]] = await Promise.all([
    db
      .select({
        model: productModels,
        listingCount,
        imageCount: visibleImageCount,
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
    rows: rows.map((row) => ({
      ...row,
      model: effectiveModel(row.model),
      /** Poes nähtavaid konfiguratsioone (sama reegel mis pood) */
      sellableListingCount: snapshot.sellableCountByModel.get(row.model.id) ?? 0,
      /** Odavaim kliendihind (täiseurod, nagu poes) */
      minCustomerPrice: snapshot.minCustomerPriceByModel.get(row.model.id) ?? null,
      galleryCount: snapshot.galleryByModel.get(row.model.id) ?? null,
    })),
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
    listings: listings.map((listing) => ({ raw: listing, effective: effectiveListing(listing), visibility: storefrontVisibility(effectiveModel(model), listing) })),
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
  /** Poes nähtav (sama reegel mis pood) / poes ei kuvata */
  scope?: "sellable" | "not-sellable";
  sort?: "sku" | "price-asc" | "price-desc" | "stock" | "updated";
  page: number;
}

export async function listListings(filters: ListingListFilters) {
  await requireAdmin();
  const db = getDb();
  const snapshot = filters.scope ? await getSellableSnapshot() : null;
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
  if (snapshot && filters.scope === "sellable") conditions.push(idIn(supplierListings.id, snapshot.listingIds));
  if (snapshot && filters.scope === "not-sellable") conditions.push(idNotIn(supplierListings.id, snapshot.listingIds));
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
      .select({ listing: supplierListings, model: productModels })
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
      const model = effectiveModel(row.model);
      return {
        raw: row.listing,
        effective: effectiveListing(row.listing),
        modelId: model.id,
        modelLabel: adminModelTitle(model),
        modelStatus: model.status,
        // Sama reegel mis pood (storefrontVisibility) — veerg "Poes" ja põhjus
        visibility: storefrontVisibility(model, row.listing),
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
    visibility: storefrontVisibility(effectiveModel(row.model), row.listing),
    units,
  };
}

/** Mudelite valik (nt filtrite jaoks). */
export async function listModelOptions() {
  await requireAdmin();
  const rows = await getDb().select().from(productModels).orderBy(asc(productModels.family), asc(productModels.model));
  return rows.map((row) => {
    const model = effectiveModel(row);
    return { id: model.id, label: adminModelTitle(model) };
  });
}

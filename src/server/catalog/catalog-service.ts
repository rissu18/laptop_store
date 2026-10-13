import "server-only";
import { cacheLife, cacheTag } from "next/cache";
import { pricingConfig } from "@/config/pricing";
import { computeFacets, filterItems, sortItems, type CatalogFacets, type SearchableItem } from "@/domain/catalog/filtering";
import { sortConfigurations } from "@/domain/catalog/configuration-order";
import { groupBusinessSeries, seriesStatsKey, summarizeBusinessSeries, type BusinessSeriesGroup, type SeriesStats } from "@/domain/catalog/business-series";
import { isImmediatelyAvailable } from "@/domain/storefront/showroom";
import { PAGE_SIZE, emptyQuery, type CatalogQuery, type FacetSelection } from "@/domain/catalog/query";
import { searchScore, tokenize } from "@/domain/catalog/search";
import { findSimilarItems, type SimilarityItem } from "@/domain/catalog/similar";
import { type CatalogItem, type CatalogProduct, type CatalogVariant } from "@/domain/catalog/types";
import { MockSupplierAdapter } from "@/integrations/supplier/mock/mock-supplier-adapter";
import { MOCK_FEATURED_SKUS } from "@/integrations/supplier/mock/mock-supplier-data";
import { toImageView, visibleImages, type ProductImageView } from "@/domain/images/product-image";
import { readImageManifestSync } from "@/server/images/image-repository";
import { getDb, isDatabaseConfigured } from "@/server/db/client";
import { CATALOG_CACHE_TAG } from "@/server/cache-tags";
import { buildCatalog, type BuiltCatalog } from "./build-catalog";
import {
  queryCatalogPage,
  queryCatalogStats,
  queryItemsByVariantIds,
  queryProductDetail,
  queryProductSlugs,
  querySimilarItems,
  querySearchSuggestions,
  querySeriesStats,
  queryTopItems,
} from "./catalog-queries";
import { loadDbCatalogItems } from "./db-catalog";

/**
 * Kataloogi teenus — ainus koht, kust lehed tooteandmeid küsivad.
 *
 * Andmeallikas:
 *  - PostgreSQL (kui DATABASE_URL on seadistatud): iga funktsioon teeb OMA kitsa päringu (catalog-queries.ts) —
 *    filtrid, tahud, sorteerimine ja LIMIT andmebaasis; tooteleht loeb ainult oma mudeli. Kogu kataloogi ei
 *    loeta lehe kuvamiseks. Tulemused on 'use cache' + cacheTag('catalog') all päringu kaupa (väikesed kirjed);
 *    sync ja admini muudatus tühjendavad vahemälu (revalidateTag / updateTag('catalog')).
 *  - Mock-tarnija mälus (ainult kui andmebaasi pole seadistatud, nt lokaalne arendus ja testid).
 * Andmebaasi viga EI vaheta vaikselt mock-andmetele — see visatakse edasi (error.tsx).
 * Lehed ja komponendid ei sõltu andmeallikast.
 */

function cached() {
  cacheTag(CATALOG_CACHE_TAG);
  cacheLife("max");
}

// ---- Mock (ilma andmebaasita) ------------------------------------------------------------------------------

let catalogPromise: Promise<BuiltCatalog> | null = null;

/**
 * Mudelipildid salvestusruumist (Phase 1–2: JSON fail, mille kirjutab `npm run icecat`).
 * Kui pilte pole (nt Vercelis enne püsiva salvestusruumi seadistamist), kuvatakse placeholder.
 */
function loadModelImages(): Record<string, ProductImageView[]> {
  const manifest = readImageManifestSync();
  // Admini peidetud pilte ei kuvata
  return Object.fromEntries(Object.entries(manifest).map(([modelId, records]) => [modelId, visibleImages(records).map(toImageView)]));
}

async function loadCatalog(): Promise<BuiltCatalog> {
  const adapter = new MockSupplierAdapter();
  const source = await adapter.getProducts();
  const catalog = buildCatalog(source, {
    pricing: pricingConfig,
    featuredExternalIds: MOCK_FEATURED_SKUS,
    lastSyncedAt: null, // päris sync puudub → "Laoseis uuendatud …" ei kuvata
    modelImages: loadModelImages(),
  });
  if (catalog.issues.length && process.env.NODE_ENV === "development") {
    // Phase 4-s salvestatakse need SyncError tabelisse ja kuvatakse adminis
    console.warn("[catalog] Tagasi lükatud kirjed:", catalog.issues);
  }
  return catalog;
}

async function getMockItems(): Promise<SearchableItem[]> {
  catalogPromise ??= loadCatalog();
  return (await catalogPromise).items;
}

/** Eemaldab sisemised väljad enne komponentidele andmist. */
function toPublic({ product, variant }: SearchableItem): CatalogItem {
  return { product, variant };
}

const hasDb = () => isDatabaseConfigured();

// ---- Kataloogi lehekülg ------------------------------------------------------------------------------------

export interface CatalogPage {
  items: CatalogItem[];
  total: number;
  page: number;
  pageCount: number;
  facets: CatalogFacets;
}

async function cachedCatalogPage(query: CatalogQuery, locked: Partial<FacetSelection>): Promise<CatalogPage> {
  "use cache";
  cached();
  return queryCatalogPage(getDb(), query, locked);
}

export async function listCatalog(query: CatalogQuery, locked: Partial<FacetSelection> = {}): Promise<CatalogPage> {
  if (hasDb()) return cachedCatalogPage(query, locked);
  const all = await getMockItems();
  const effective: CatalogQuery = { ...query, facets: { ...query.facets, ...locked } };
  const matching = sortItems(filterItems(all, effective), effective.sort);
  const pageCount = Math.max(1, Math.ceil(matching.length / PAGE_SIZE));
  const page = Math.min(query.page, pageCount);
  return {
    items: matching.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE).map(toPublic),
    total: matching.length,
    page,
    pageCount,
    facets: computeFacets(all, effective),
  };
}

// ---- Tooteleht ---------------------------------------------------------------------------------------------

export interface ProductPageData {
  product: CatalogProduct;
  variants: CatalogVariant[];
}

async function cachedProductPage(slug: string): Promise<ProductPageData | null> {
  "use cache";
  cached();
  return queryProductDetail(getDb(), slug);
}

/** Üks mudel slug'i järgi koos konfiguratsioonidega (poes kohapeal enne, grupi sees odavam enne) — ei loe ülejäänud kataloogi. */
export async function getProductPage(slug: string): Promise<ProductPageData | null> {
  if (hasDb()) return cachedProductPage(slug);
  const matches = (await getMockItems()).filter((item) => item.product.slug === slug);
  if (matches.length === 0) return null;
  return {
    product: matches[0].product,
    variants: sortConfigurations(matches.map((item) => item.variant)),
  };
}

async function cachedProductSlugs(): Promise<string[]> {
  "use cache";
  cached();
  return queryProductSlugs(getDb());
}

export async function getAllProductSlugs(): Promise<string[]> {
  if (hasDb()) return cachedProductSlugs();
  return [...new Set((await getMockItems()).map((item) => item.product.slug))];
}

/** Ostukorv / võrdlus: ainult küsitud pakkumised (ja nende mudelid). */
export async function getItemsByVariantIds(ids: string[]): Promise<CatalogItem[]> {
  if (hasDb()) return cachedItemsByVariantIds(ids);
  const byId = new Map((await getMockItems()).map((item) => [item.variant.id, item]));
  return ids.flatMap((id) => {
    const item = byId.get(id);
    return item ? [toPublic(item)] : [];
  });
}

async function cachedItemsByVariantIds(ids: string[]): Promise<CatalogItem[]> {
  "use cache";
  cached();
  return queryItemsByVariantIds(getDb(), ids);
}

// ---- Avaleht ja valikud (LIMIT-päringud) ------------------------------------------------------------------

async function cachedFeaturedItems(limit: number): Promise<CatalogItem[]> {
  "use cache";
  cached();
  return queryTopItems(getDb(), emptyQuery(), limit, { featuredOnly: true, onePerModel: true });
}

export async function getFeaturedItems(limit: number): Promise<CatalogItem[]> {
  if (hasDb()) return cachedFeaturedItems(limit);
  // Esiletõstmine on mudeli tasemel (admin) — igast mudelist näidatakse üht (soovituslikum) konfiguratsiooni
  const featured = sortItems((await getMockItems()).filter((item) => item.variant.isFeatured), "recommended");
  const seen = new Set<string>();
  const unique = featured.filter((item) => !seen.has(item.product.slug) && seen.add(item.product.slug));
  return unique.slice(0, limit).map(toPublic);
}

async function cachedRecentlyAddedItems(limit: number): Promise<CatalogItem[]> {
  "use cache";
  cached();
  return queryTopItems(getDb(), { ...emptyQuery(), sort: "recently-added" }, limit);
}

export async function getRecentlyAddedItems(limit: number): Promise<CatalogItem[]> {
  if (hasDb()) return cachedRecentlyAddedItems(limit);
  return sortItems(await getMockItems(), "recently-added").slice(0, limit).map(toPublic);
}

async function cachedAllDbItems(): Promise<SearchableItem[]> {
  "use cache";
  cached();
  return loadDbCatalogItems();
}

/**
 * Kõik müüdavad pakkumised (avalikul kujul) — AINULT laptop finderi server action'ile (punktiarvutus vajab kõiki
 * välju). Kataloogi, tootelehe ja avalehe kuvamine seda ei kasuta. Vt docs/HANDOFF.md → jõudlus (P2).
 */
export async function getAllItems(): Promise<CatalogItem[]> {
  return (hasDb() ? await cachedAllDbItems() : await getMockItems()).map(toPublic);
}

// ---- Sarnased tooted ---------------------------------------------------------------------------------------

async function cachedSimilarItems(current: SimilarityItem, limit: number): Promise<CatalogItem[]> {
  "use cache";
  cached();
  return querySimilarItems(getDb(), current, limit);
}

/** Sarnased sülearvutid valitud konfiguratsioonile (hind ±25%, ka teised tootjad) — vt domain/catalog/similar.ts */
export async function getSimilarItems(current: CatalogItem, limit: number): Promise<CatalogItem[]> {
  if (hasDb()) {
    const { product, variant } = current;
    // Ainult võrdluseks vajalikud väljad (väike vahemälu võti)
    const key: SimilarityItem = {
      product: { slug: product.slug, brand: product.brand, series: product.series, screenSizeIn: product.screenSizeIn },
      variant: {
        id: variant.id,
        sku: variant.sku,
        ramGb: variant.ramGb,
        storageGb: variant.storageGb,
        cpu: { family: variant.cpu.family, model: variant.cpu.model },
        gpu: { dedicated: variant.gpu.dedicated },
        price: { saleCents: variant.price.saleCents },
        stock: { available: variant.stock.available },
      },
    };
    return cachedSimilarItems(key, limit);
  }
  return findSimilarItems(current, (await getMockItems()).map(toPublic), limit);
}

// ---- Avalehe statistika ja seeriad -------------------------------------------------------------------------

async function cachedCatalogStats() {
  "use cache";
  cached();
  return queryCatalogStats(getDb());
}

export async function getCatalogStats(): Promise<{ count: number; minPriceCents: number | null; immediateCount: number }> {
  if (hasDb()) return cachedCatalogStats();
  const items = await getMockItems();
  return {
    count: items.length,
    minPriceCents: items.length ? Math.min(...items.map((item) => item.variant.price.saleCents)) : null,
    // "Kohe saadaval" pakkumised (salong), mitte partneri laos — vt domain/storefront/showroom.ts
    immediateCount: items.filter((item) => isImmediatelyAvailable(item.variant.stock)).length,
  };
}

async function cachedBusinessSeries(): Promise<BusinessSeriesGroup[]> {
  "use cache";
  cached();
  const stats: SeriesStats = new Map();
  for (const row of await querySeriesStats(getDb())) stats.set(seriesStatsKey(row.brand, row.series), { count: row.count, minPriceCents: row.min_price });
  return groupBusinessSeries(stats, 3);
}

/** Avalehe äriklassi seeriad päris kataloogist (filtrisüsteemi seeria väärtustega). */
export async function getBusinessSeries(): Promise<BusinessSeriesGroup[]> {
  if (hasDb()) return cachedBusinessSeries();
  return summarizeBusinessSeries((await getMockItems()).map(toPublic), 3);
}

// ---- Otsingusoovitused -------------------------------------------------------------------------------------

async function cachedSearchSuggestions(q: string, limit: number): Promise<CatalogItem[]> {
  "use cache";
  cached();
  return querySearchSuggestions(getDb(), q, limit);
}

export async function searchSuggestions(q: string, limit: number): Promise<CatalogItem[]> {
  const tokens = tokenize(q);
  if (tokens.length === 0) return [];
  if (hasDb()) return cachedSearchSuggestions(tokens.join(" "), limit);
  const matches = filterItems(await getMockItems(), { ...emptyQuery(), q });
  return matches
    .map((item) => ({ item, score: searchScore(item.searchText, tokens) }))
    .sort((a, b) => b.score - a.score || a.item.variant.price.saleCents - b.item.variant.price.saleCents)
    .slice(0, limit)
    .map(({ item }) => toPublic(item));
}

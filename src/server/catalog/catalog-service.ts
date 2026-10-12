import "server-only";
import { cacheLife, cacheTag } from "next/cache";
import { pricingConfig } from "@/config/pricing";
import { computeFacets, filterItems, sortItems, type CatalogFacets, type SearchableItem } from "@/domain/catalog/filtering";
import { summarizeBusinessSeries, type BusinessSeriesGroup } from "@/domain/catalog/business-series";
import { isImmediatelyAvailable } from "@/domain/storefront/showroom";
import { PAGE_SIZE, emptyQuery, type CatalogQuery, type FacetSelection } from "@/domain/catalog/query";
import { searchScore, tokenize } from "@/domain/catalog/search";
import { findSimilarItems } from "@/domain/catalog/similar";
import { type CatalogItem, type CatalogProduct, type CatalogVariant } from "@/domain/catalog/types";
import { MockSupplierAdapter } from "@/integrations/supplier/mock/mock-supplier-adapter";
import { MOCK_FEATURED_SKUS } from "@/integrations/supplier/mock/mock-supplier-data";
import { toImageView, visibleImages, type ProductImageView } from "@/domain/images/product-image";
import { readImageManifestSync } from "@/server/images/image-repository";
import { isDatabaseConfigured } from "@/server/db/client";
import { buildCatalog, type BuiltCatalog } from "./build-catalog";
import { loadDbCatalogItems } from "./db-catalog";

/**
 * Kataloogi teenus — ainus koht, kust lehed tooteandmeid küsivad.
 *
 * Andmeallikas:
 *  - PostgreSQL (kui DATABASE_URL on seadistatud) — 'use cache' + cacheTag('catalog'); admini muudatus
 *    tühjendab vahemälu (updateTag('catalog')), seega pood näeb muudatust kohe.
 *  - Mock-tarnija mälus (ainult kui andmebaasi pole seadistatud, nt lokaalne arendus ja testid).
 * Andmebaasi viga EI vaheta vaikselt mock-andmetele — see logitakse ja visatakse edasi.
 * Lehed ja komponendid ei sõltu andmeallikast.
 */

import { CATALOG_CACHE_TAG } from "@/server/cache-tags";

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

async function getCachedDbItems(): Promise<SearchableItem[]> {
  "use cache";
  cacheTag(CATALOG_CACHE_TAG);
  cacheLife("max");
  return loadDbCatalogItems();
}

async function getItems(): Promise<SearchableItem[]> {
  if (isDatabaseConfigured()) return getCachedDbItems();
  catalogPromise ??= loadCatalog();
  return (await catalogPromise).items;
}

/** Eemaldab sisemised väljad enne komponentidele andmist. */
function toPublic({ product, variant }: SearchableItem): CatalogItem {
  return { product, variant };
}

export interface CatalogPage {
  items: CatalogItem[];
  total: number;
  page: number;
  pageCount: number;
  facets: CatalogFacets;
}

export async function listCatalog(query: CatalogQuery, locked: Partial<FacetSelection> = {}): Promise<CatalogPage> {
  const all = await getItems();
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

export interface ProductPageData {
  product: CatalogProduct;
  variants: CatalogVariant[];
}

export async function getProductPage(slug: string): Promise<ProductPageData | null> {
  const matches = (await getItems()).filter((item) => item.product.slug === slug);
  if (matches.length === 0) return null;
  return {
    product: matches[0].product,
    variants: sortItems(matches, "price-asc").map((item) => item.variant),
  };
}

export async function getAllProductSlugs(): Promise<string[]> {
  return [...new Set((await getItems()).map((item) => item.product.slug))];
}

export async function getItemsByVariantIds(ids: string[]): Promise<CatalogItem[]> {
  const byId = new Map((await getItems()).map((item) => [item.variant.id, item]));
  return ids.flatMap((id) => {
    const item = byId.get(id);
    return item ? [toPublic(item)] : [];
  });
}

export async function getFeaturedItems(limit: number): Promise<CatalogItem[]> {
  // Esiletõstmine on mudeli tasemel (admin) — igast mudelist näidatakse üht (soovituslikum) konfiguratsiooni
  const featured = sortItems((await getItems()).filter((item) => item.variant.isFeatured), "recommended");
  const seen = new Set<string>();
  const unique = featured.filter((item) => !seen.has(item.product.slug) && seen.add(item.product.slug));
  return unique.slice(0, limit).map(toPublic);
}

export async function getRecentlyAddedItems(limit: number): Promise<CatalogItem[]> {
  return sortItems(await getItems(), "recently-added").slice(0, limit).map(toPublic);
}

/** Kõik müüdavad pakkumised (avalikul kujul) — nt laptop finderi jaoks. Phase 2-s andmebaasipäring. */
export async function getAllItems(): Promise<CatalogItem[]> {
  return (await getItems()).map(toPublic);
}

/** Sarnased sülearvutid valitud konfiguratsioonile (hind ±25%, ka teised tootjad) — vt domain/catalog/similar.ts */
export async function getSimilarItems(current: CatalogItem, limit: number): Promise<CatalogItem[]> {
  return findSimilarItems(current, (await getItems()).map(toPublic), limit);
}

export async function getCatalogStats(): Promise<{ count: number; minPriceCents: number | null; immediateCount: number }> {
  const items = await getItems();
  return {
    count: items.length,
    minPriceCents: items.length ? Math.min(...items.map((item) => item.variant.price.saleCents)) : null,
    // "Kohe saadaval" pakkumised (salong), mitte partneri laos — vt domain/storefront/showroom.ts
    immediateCount: items.filter((item) => isImmediatelyAvailable(item.variant.stock)).length,
  };
}

/** Avalehe äriklassi seeriad päris kataloogist (filtrisüsteemi seeria väärtustega). */
export async function getBusinessSeries(): Promise<BusinessSeriesGroup[]> {
  return summarizeBusinessSeries((await getItems()).map(toPublic), 3);
}

export async function searchSuggestions(q: string, limit: number): Promise<CatalogItem[]> {
  const tokens = tokenize(q);
  if (tokens.length === 0) return [];
  const matches = filterItems(await getItems(), { ...emptyQuery(), q });
  return matches
    .map((item) => ({ item, score: searchScore(item.searchText, tokens) }))
    .sort((a, b) => b.score - a.score || a.item.variant.price.saleCents - b.item.variant.price.saleCents)
    .slice(0, limit)
    .map(({ item }) => toPublic(item));
}

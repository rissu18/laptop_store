import "server-only";
import { storeConfig } from "@/config/store";
import { pricingConfig } from "@/config/pricing";
import { computeFacets, filterItems, sortItems, type CatalogFacets, type SearchableItem } from "@/domain/catalog/filtering";
import { seriesSlug } from "@/domain/catalog/facets";
import { PAGE_SIZE, emptyQuery, type CatalogQuery, type FacetSelection } from "@/domain/catalog/query";
import { searchScore, tokenize } from "@/domain/catalog/search";
import type { CatalogItem, CatalogProduct, CatalogVariant } from "@/domain/catalog/types";
import { MockSupplierAdapter } from "@/integrations/supplier/mock/mock-supplier-adapter";
import { MOCK_FEATURED_SKUS } from "@/integrations/supplier/mock/mock-supplier-data";
import { toImageView, type ProductImageView } from "@/domain/images/product-image";
import { readImageManifestSync } from "@/server/images/image-repository";
import { buildCatalog, type BuiltCatalog } from "./build-catalog";

/**
 * Kataloogi teenus — ainus koht, kust lehed tooteandmeid küsivad.
 *
 * Phase 1: andmed tulevad MockSupplierAdapter'ist mälus.
 * Phase 2: sama liides, aga andmed PostgreSQL-ist (Prisma) + 'use cache' / cacheTag('catalog').
 * Lehed ja komponendid ei pea siis muutuma.
 */

let catalogPromise: Promise<BuiltCatalog> | null = null;

/**
 * Mudelipildid salvestusruumist (Phase 1–2: JSON fail, mille kirjutab `npm run icecat`).
 * Kui pilte pole (nt Vercelis enne püsiva salvestusruumi seadistamist), kuvatakse placeholder.
 */
function loadModelImages(): Record<string, ProductImageView[]> {
  const manifest = readImageManifestSync();
  return Object.fromEntries(Object.entries(manifest).map(([modelId, records]) => [modelId, records.map(toImageView)]));
}

async function loadCatalog(): Promise<BuiltCatalog> {
  const adapter = new MockSupplierAdapter();
  const source = await adapter.getProducts();
  const catalog = buildCatalog(source, {
    pricing: pricingConfig,
    featuredExternalIds: MOCK_FEATURED_SKUS,
    delivery: storeConfig.delivery,
    lastSyncedAt: null, // päris sync puudub → "Laoseis uuendatud …" ei kuvata
    modelImages: loadModelImages(),
  });
  if (catalog.issues.length && process.env.NODE_ENV === "development") {
    // Phase 4-s salvestatakse need SyncError tabelisse ja kuvatakse adminis
    console.warn("[catalog] Tagasi lükatud kirjed:", catalog.issues);
  }
  return catalog;
}

async function getItems(): Promise<SearchableItem[]> {
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
  const featured = (await getItems()).filter((item) => item.variant.isFeatured);
  return sortItems(featured, "recommended").slice(0, limit).map(toPublic);
}

export async function getRecentlyAddedItems(limit: number): Promise<CatalogItem[]> {
  return sortItems(await getItems(), "recently-added").slice(0, limit).map(toPublic);
}

export async function getRelatedItems(product: CatalogProduct, limit: number): Promise<CatalogItem[]> {
  const others = (await getItems()).filter((item) => item.product.slug !== product.slug);
  const sameSeries = others.filter((item) => item.product.series === product.series);
  const pool = sameSeries.length >= limit ? sameSeries : others;
  // Üks konfiguratsioon mudeli kohta, et soovitused oleksid mitmekesised
  const seen = new Set<string>();
  return sortItems(pool, "recommended")
    .filter((item) => !seen.has(item.product.slug) && seen.add(item.product.slug))
    .slice(0, limit)
    .map(toPublic);
}

export interface SeriesSummary {
  slug: string;
  brand: CatalogProduct["brand"];
  count: number;
  minPriceCents: number;
}

export async function getSeriesSummaries(): Promise<SeriesSummary[]> {
  const map = new Map<string, SeriesSummary>();
  for (const { product, variant } of await getItems()) {
    const slug = seriesSlug(product.series);
    const current = map.get(slug);
    map.set(slug, {
      slug,
      brand: product.brand,
      count: (current?.count ?? 0) + 1,
      minPriceCents: Math.min(current?.minPriceCents ?? Infinity, variant.price.saleCents),
    });
  }
  return [...map.values()].sort((a, b) => b.count - a.count);
}

export async function getCatalogStats(): Promise<{ count: number; minPriceCents: number | null }> {
  const items = await getItems();
  return {
    count: items.length,
    minPriceCents: items.length ? Math.min(...items.map((item) => item.variant.price.saleCents)) : null,
  };
}

/** Kõige suurema valikuga mudelid (hero "populaarsed otsingud"). */
export async function getPopularModels(limit: number): Promise<{ label: string; query: string }[]> {
  const counts = new Map<string, { label: string; count: number }>();
  for (const { product } of await getItems()) {
    const label = `${product.series.replace(/ P$/, "")} ${product.model}`;
    counts.set(label, { label, count: (counts.get(label)?.count ?? 0) + 1 });
  }
  return [...counts.values()]
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label))
    .slice(0, limit)
    .map(({ label }) => ({ label, query: label }));
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

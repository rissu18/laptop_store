import { FACETS, MULTI_FACET_KEYS, type MultiFacetKey } from "./facets";
import { FEATURE_KEYS, type FeatureKey } from "./types";

/**
 * Kataloogi päring = filtrid + sorteerimine + lehekülg.
 * Kogu olek elab URL-is, nii et filtreeritud vaadet saab jagada ja tagasi-nupp töötab.
 */

export const SORT_OPTIONS = [
  { key: "recommended", label: "Soovitatud" },
  { key: "price-asc", label: "Odavamad enne" },
  { key: "price-desc", label: "Kallimad enne" },
  { key: "newest-model", label: "Uuemad mudelid enne" },
  { key: "recently-added", label: "Hiljuti lisatud" },
] as const;
export type SortKey = (typeof SORT_OPTIONS)[number]["key"];

export const PAGE_SIZE = 24;
const MAX_VALUES_PER_FACET = 20;
const MAX_QUERY_LENGTH = 100;

export type FacetSelection = Record<MultiFacetKey, string[]>;

export interface CatalogQuery {
  q: string;
  facets: FacetSelection;
  features: FeatureKey[];
  /** Eurodes (täisarv) */
  minPrice: number | null;
  maxPrice: number | null;
  sort: SortKey;
  page: number;
}

export type RawSearchParams = Record<string, string | string[] | undefined>;

export function emptyFacetSelection(): FacetSelection {
  return Object.fromEntries(MULTI_FACET_KEYS.map((key) => [key, []])) as unknown as FacetSelection;
}

export function emptyQuery(): CatalogQuery {
  return { q: "", facets: emptyFacetSelection(), features: [], minPrice: null, maxPrice: null, sort: "recommended", page: 1 };
}

function firstValue(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function listValue(value: string | string[] | undefined): string[] {
  const raw = Array.isArray(value) ? value.join(",") : (value ?? "");
  return raw
    .split(",")
    .map((part) => part.trim().toLowerCase())
    .filter(Boolean);
}

function parsePrice(value: string | undefined): number | null {
  if (!value || !/^\d{1,6}$/.test(value)) return null;
  return Number(value);
}

/**
 * URL → CatalogQuery. Kõik tundmatu või vigane visatakse vaikselt minema
 * (brauserist tulevat sisendit ei usaldata).
 */
export function parseCatalogQuery(params: RawSearchParams): CatalogQuery {
  const query = emptyQuery();

  query.q = (firstValue(params.q) ?? "").trim().slice(0, MAX_QUERY_LENGTH);

  for (const key of MULTI_FACET_KEYS) {
    const definition = FACETS[key];
    query.facets[key] = [...new Set(listValue(params[key]))]
      .filter(definition.isValidValue)
      .slice(0, MAX_VALUES_PER_FACET);
  }

  query.features = [...new Set(listValue(params.f))].filter((value): value is FeatureKey =>
    (FEATURE_KEYS as readonly string[]).includes(value),
  );

  query.minPrice = parsePrice(firstValue(params.min));
  query.maxPrice = parsePrice(firstValue(params.max));
  if (query.minPrice !== null && query.maxPrice !== null && query.minPrice > query.maxPrice) {
    [query.minPrice, query.maxPrice] = [query.maxPrice, query.minPrice];
  }

  const sort = firstValue(params.sort);
  query.sort = SORT_OPTIONS.some((option) => option.key === sort) ? (sort as SortKey) : "recommended";

  const page = Number(firstValue(params.page));
  query.page = Number.isInteger(page) && page > 0 && page < 10_000 ? page : 1;

  return query;
}

/** CatalogQuery → URL query string (stabiilne järjekord, vaikimisi väärtused jäetakse välja). */
export function serializeCatalogQuery(query: CatalogQuery, lockedFacets: Partial<FacetSelection> = {}): string {
  const params = new URLSearchParams();
  if (query.q) params.set("q", query.q);
  for (const key of MULTI_FACET_KEYS) {
    if (lockedFacets[key]) continue; // nt brändilehel on bränd URL-i path'is
    const values = query.facets[key];
    if (values.length) params.set(key, [...values].sort(FACETS[key].compare).join(","));
  }
  if (query.features.length) params.set("f", [...query.features].sort().join(","));
  if (query.minPrice !== null) params.set("min", String(query.minPrice));
  if (query.maxPrice !== null) params.set("max", String(query.maxPrice));
  if (query.sort !== "recommended") params.set("sort", query.sort);
  if (query.page > 1) params.set("page", String(query.page));
  // URLSearchParams kodeerib koma kui %2C — loetavuse huvides jätame komad alles
  return params.toString().replace(/%2C/g, ",");
}

export function buildCatalogHref(basePath: string, query: CatalogQuery, lockedFacets: Partial<FacetSelection> = {}): string {
  const search = serializeCatalogQuery(query, lockedFacets);
  return search ? `${basePath}?${search}` : basePath;
}

// ---- Muudatused (iga muudatus viib tagasi 1. lehele) -------------------------

export function toggleFacetValue(query: CatalogQuery, key: MultiFacetKey, value: string): CatalogQuery {
  const current = query.facets[key];
  const next = current.includes(value) ? current.filter((v) => v !== value) : [...current, value];
  return { ...query, facets: { ...query.facets, [key]: next }, page: 1 };
}

export function toggleFeature(query: CatalogQuery, feature: FeatureKey): CatalogQuery {
  const next = query.features.includes(feature)
    ? query.features.filter((f) => f !== feature)
    : [...query.features, feature];
  return { ...query, features: next, page: 1 };
}

export function withPriceRange(query: CatalogQuery, minPrice: number | null, maxPrice: number | null): CatalogQuery {
  return { ...query, minPrice, maxPrice, page: 1 };
}

export function withSort(query: CatalogQuery, sort: SortKey): CatalogQuery {
  return { ...query, sort, page: 1 };
}

export function withPage(query: CatalogQuery, page: number): CatalogQuery {
  return { ...query, page };
}

export function clearFilters(query: CatalogQuery): CatalogQuery {
  return { ...emptyQuery(), sort: query.sort };
}

export function countActiveFilters(query: CatalogQuery, lockedFacets: Partial<FacetSelection> = {}): number {
  const facetCount = MULTI_FACET_KEYS.filter((key) => !lockedFacets[key]).reduce(
    (sum, key) => sum + query.facets[key].length,
    0,
  );
  return (
    facetCount +
    query.features.length +
    (query.minPrice !== null || query.maxPrice !== null ? 1 : 0) +
    (query.q ? 1 : 0)
  );
}

/**
 * Kas URL sisaldab filtreid või sorteerimist (siis leht saab noindex, et vältida tuhandeid duplikaatlehti).
 * Lehekülgede numbrid (?page=2) jäävad indekseeritavaks.
 */
export function hasFilters(query: CatalogQuery, lockedFacets: Partial<FacetSelection> = {}): boolean {
  return countActiveFilters(query, lockedFacets) > 0 || query.sort !== "recommended";
}

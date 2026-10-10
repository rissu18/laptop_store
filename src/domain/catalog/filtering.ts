import { FACETS, MULTI_FACET_KEYS, cpuGenerationRank, type MultiFacetKey } from "./facets";
import { FEATURE_LABELS, FEATURE_ORDER } from "./features";
import { GRADE_CODES } from "@/domain/grade/grades";
import { matchesSearch, tokenize } from "./search";
import type { CatalogQuery, SortKey } from "./query";
import type { CatalogItem, FeatureKey } from "./types";

/**
 * Filtreerimine, facet'ide loendurid ja sorteerimine.
 * Phase 2-s asendub see SQL päringutega; testid jäävad kehtima käitumise kirjeldusena.
 */

export interface SearchableItem extends CatalogItem {
  searchText: string;
}

export interface FacetOption {
  value: string;
  label: string;
  count: number;
  selected: boolean;
}

export interface CatalogFacets {
  multi: Record<MultiFacetKey, FacetOption[]>;
  features: FacetOption[];
  /** Hinnavahemik eurodes (filtreeritud toodete põhjal, hinnafilter välja arvatud) */
  price: { min: number; max: number } | null;
}

type Exclude = { facet?: MultiFacetKey; feature?: FeatureKey; price?: boolean };

function matchesQuery(item: SearchableItem, query: CatalogQuery, queryTokens: string[], exclude: Exclude = {}): boolean {
  if (!matchesSearch(item.searchText, queryTokens)) return false;

  for (const key of MULTI_FACET_KEYS) {
    if (key === exclude.facet) continue;
    const selected = query.facets[key];
    if (selected.length === 0) continue;
    // Sama filtri sees: VÕI (16 GB või 32 GB). Eri filtrite vahel: JA.
    if (!FACETS[key].valuesOf(item).some((value) => selected.includes(value))) return false;
  }

  for (const feature of query.features) {
    if (feature === exclude.feature) continue;
    if (item.variant.features[feature] !== true) return false;
  }

  if (!exclude.price) {
    const euros = item.variant.price.saleCents / 100;
    if (query.minPrice !== null && euros < query.minPrice) return false;
    if (query.maxPrice !== null && euros > query.maxPrice) return false;
  }

  return true;
}

export function filterItems(items: SearchableItem[], query: CatalogQuery): SearchableItem[] {
  const tokens = tokenize(query.q);
  return items.filter((item) => matchesQuery(item, query, tokens));
}

/**
 * Iga filtri valiku juures näidatakse, mitu toodet see annaks.
 * Loendur arvestab KÕIKI teisi aktiivseid filtreid, aga mitte sama filtri teisi valikuid
 * (muidu kaoksid ülejäänud valikud kohe pärast esimese valimist).
 */
export function computeFacets(items: SearchableItem[], query: CatalogQuery): CatalogFacets {
  const tokens = tokenize(query.q);

  const multi = {} as Record<MultiFacetKey, FacetOption[]>;
  for (const key of MULTI_FACET_KEYS) {
    const definition = FACETS[key];
    const counts = new Map<string, number>();
    for (const item of items) {
      if (!matchesQuery(item, query, tokens, { facet: key })) continue;
      for (const value of definition.valuesOf(item)) counts.set(value, (counts.get(value) ?? 0) + 1);
    }
    // Valitud väärtus jääb nähtavale ka siis, kui tulemusi on 0 (et seda saaks eemaldada)
    for (const value of query.facets[key]) if (!counts.has(value)) counts.set(value, 0);

    multi[key] = [...counts.entries()]
      .sort(([a], [b]) => definition.compare(a, b))
      .map(([value, count]) => ({
        value,
        label: definition.optionLabel(value),
        count,
        selected: query.facets[key].includes(value),
      }));
  }

  const features: FacetOption[] = [];
  for (const feature of FEATURE_ORDER) {
    let count = 0;
    for (const item of items) {
      if (item.variant.features[feature] === true && matchesQuery(item, query, tokens, { feature })) count++;
    }
    const selected = query.features.includes(feature);
    // Omadust, mida ühelgi tootel pole (või mille kohta pole andmeid), ei näidata
    if (count > 0 || selected) features.push({ value: feature, label: FEATURE_LABELS[feature], count, selected });
  }

  let price: CatalogFacets["price"] = null;
  for (const item of items) {
    if (!matchesQuery(item, query, tokens, { price: true })) continue;
    const euros = item.variant.price.saleCents / 100;
    price = price
      ? { min: Math.min(price.min, Math.floor(euros)), max: Math.max(price.max, Math.ceil(euros)) }
      : { min: Math.floor(euros), max: Math.ceil(euros) };
  }

  return { multi, features, price };
}

const gradeRank = (item: CatalogItem) => GRADE_CODES.indexOf(item.variant.grade);
const price = (item: CatalogItem) => item.variant.price.saleCents;
const generation = (item: CatalogItem) => cpuGenerationRank(item.variant.cpu.generationKey);

const COMPARATORS: Record<SortKey, (a: CatalogItem, b: CatalogItem) => number> = {
  recommended: (a, b) =>
    Number(b.variant.isFeatured) - Number(a.variant.isFeatured) ||
    generation(b) - generation(a) ||
    gradeRank(a) - gradeRank(b) ||
    price(a) - price(b),
  "price-asc": (a, b) => price(a) - price(b),
  "price-desc": (a, b) => price(b) - price(a),
  "newest-model": (a, b) => generation(b) - generation(a) || price(a) - price(b),
  "recently-added": (a, b) => b.variant.firstSeenAt.localeCompare(a.variant.firstSeenAt) || price(a) - price(b),
};

export function sortItems<T extends CatalogItem>(items: T[], sort: SortKey): T[] {
  // Viimane võrdlus SKU järgi teeb järjekorra stabiilseks (sama URL → sama järjekord)
  return [...items].sort((a, b) => COMPARATORS[sort](a, b) || a.variant.sku.localeCompare(b.variant.sku));
}

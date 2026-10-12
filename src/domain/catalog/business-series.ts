import { seriesFilterValue, seriesLabel } from "./facets";
import { BRAND_NAMES, type BrandCode, type CatalogItem } from "./types";

/**
 * Avalehe "Populaarsed äriklassi seeriad": äriklassi seeriad PÄRIS kataloogist, filtrisüsteemi
 * seeria väärtustega (`seriesFilterValue` — sama, mida kasutab nimekirja seeriafilter).
 * Nimekiri määrab ainult järjekorra ja selle, mis on "äriklass" — seeriat, mida kataloogis pole, ei kuvata.
 */
const BUSINESS_SERIES: { brand: BrandCode; values: string[] }[] = [
  { brand: "lenovo", values: ["thinkpad-t", "thinkpad-x1", "thinkpad-x13", "thinkpad-x", "thinkpad-l", "thinkpad-p", "thinkpad-e"] },
  { brand: "dell", values: ["latitude", "precision"] },
  { brand: "hp", values: ["elitebook", "probook", "zbook"] },
];

export interface BusinessSeries {
  value: string;
  /** "ThinkPad T" (ilma tootjata — kuvatakse tootja rühmas) */
  label: string;
  count: number;
  minPriceCents: number;
  href: string;
}

export interface BusinessSeriesGroup {
  brand: BrandCode;
  brandName: string;
  series: BusinessSeries[];
}

export function seriesHref(brand: BrandCode, value: string): string {
  return `/sulearvutid/${brand}?series=${encodeURIComponent(value)}`;
}

/** Tootjate kaupa, nimekirja järjekorras; ainult seeriad, millel on vähemalt `minCount` müügis toodet. */
export function summarizeBusinessSeries(items: CatalogItem[], minCount = 1): BusinessSeriesGroup[] {
  const stats = new Map<string, { count: number; minPriceCents: number }>();
  for (const { product, variant } of items) {
    if (!variant.stock.available) continue;
    const key = `${product.brand}:${seriesFilterValue(product)}`;
    const current = stats.get(key);
    stats.set(key, {
      count: (current?.count ?? 0) + 1,
      minPriceCents: Math.min(current?.minPriceCents ?? Infinity, variant.price.saleCents),
    });
  }

  return BUSINESS_SERIES.map(({ brand, values }) => {
    const brandName = BRAND_NAMES[brand];
    const series = values.flatMap((value) => {
      const stat = stats.get(`${brand}:${value}`);
      if (!stat || stat.count < minCount) return [];
      const label = seriesLabel(value).replace(new RegExp(`^${brandName}\\s+`), "");
      return [{ value, label, count: stat.count, minPriceCents: stat.minPriceCents, href: seriesHref(brand, value) }];
    });
    return { brand, brandName, series };
  }).filter((group) => group.series.length > 0);
}

import { GRADES, GRADE_CODES, gradeDisplay } from "@/domain/grade/grades";
import {
  compareCpuFamilies,
  compareCpuGenerations,
  cpuFamilyLabel,
  cpuFilterFamily,
  cpuFilterGeneration,
  cpuGenerationLabel,
  isCpuFamilyValue,
  isCpuGenerationValue,
} from "./cpu-filter";
import { isInStore } from "./configuration-order";
import { KEYBOARD_FILTER_PATTERN, compareKeyboardFilterValues, keyboardFilterLabel, keyboardFilterValue } from "./keyboard";
import { BRAND_CODES, BRAND_NAMES, type CatalogItem, type CatalogProduct, type CatalogVariant } from "./types";

export { cpuFamilyLabel, cpuGenerationLabel, cpuGenerationRank } from "./cpu-filter";

/**
 * Filtrite (facet'ite) definitsioonid — ÜKS koht, kust tulevad:
 * väärtused, sildid, järjekord ja URL-i parameetrid.
 * Filtripaneel, aktiivsete filtrite chip'id ja serveri filtreerimine kasutavad kõik seda.
 */

export const MULTI_FACET_KEYS = ["delivery", "supplier", "brand", "series", "grade", "screen", "ram", "ssd", "cpu", "gen", "kb"] as const;
export type MultiFacetKey = (typeof MULTI_FACET_KEYS)[number];

export interface FacetDefinition {
  key: MultiFacetKey;
  label: string;
  /** Väärtused, mille alla see toode kuulub (URL-i kujul) — filtripaneeli valikud ja loendurid. */
  valuesOf: (item: CatalogItem) => string[];
  /**
   * Väärtused, millega toode URL-i filtrile vastab, kui need erinevad valikutest (nt vana/üldisem
   * väärtus "thinkpad" vastab ka "thinkpad-t" tootele). Vaikimisi = valuesOf.
   */
  matchValuesOf?: (item: CatalogItem) => string[];
  optionLabel: (value: string) => string;
  /** Kas URL-ist tulnud väärtus on lubatud. */
  isValidValue: (value: string) => boolean;
  /** Valikute järjekord filtripaneelis. */
  compare: (a: string, b: string) => number;
}

const SLUG_PATTERN = /^[a-z0-9-]{1,40}$/;

// ---- Bucket'id: toote täpne väärtus → filtri väärtus -----------------------

export function screenBucket(sizeIn: number): string {
  return String(Math.min(17, Math.max(13, Math.floor(sizeIn))));
}

export function ramBucket(gb: number): string {
  if (gb >= 64) return "64";
  if (gb >= 32) return "32";
  if (gb >= 16) return "16";
  return "8";
}

export function ssdBucket(gb: number): string {
  if (gb >= 2048) return "2048";
  if (gb >= 1024) return "1024";
  if (gb >= 512) return "512";
  return "256";
}

export function seriesSlug(series: string): string {
  return series.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}

/**
 * Lenovo ThinkPadi alamseeria mudelinimest (T14 → T, X1 Carbon → X1, X13 Yoga → X13, X395 → X, L14 → L,
 * E15 → E, P14s → P). Tundmatu ThinkPad jääb üldiseks "ThinkPad"-iks. Teised seeriad (ThinkBook, Yoga,
 * V-seeria) jäävad oma seeriaks. Andmeid ei muudeta — ainult filtri väärtus.
 */
const THINKPAD_LINES: [RegExp, string][] = [
  [/^X1(?!\d)/i, "thinkpad-x1"],
  [/^X13(?!\d)/i, "thinkpad-x13"],
  [/^X\d/i, "thinkpad-x"],
  [/^T\d/i, "thinkpad-t"],
  [/^L\d/i, "thinkpad-l"],
  [/^E\d/i, "thinkpad-e"],
  [/^P\d/i, "thinkpad-p"],
];

export function seriesFilterValue(product: Pick<CatalogProduct, "brand" | "series" | "model">): string {
  const slug = seriesSlug(product.series);
  if (product.brand !== "lenovo" || (slug !== "thinkpad" && slug !== "thinkpad-p")) return slug;
  const model = product.model.trim();
  return THINKPAD_LINES.find(([pattern]) => pattern.test(model))?.[1] ?? slug;
}

/**
 * Tarnija filter: andmebaasi kood (`supplier_listings.supplier`) → kliendile nähtav nimi. Sisemist koodi ("tech")
 * kliendile ei näidata. Tundmatu tarnija (nt mock) filtris ei osale.
 */
export const SUPPLIER_FILTER_LABELS: Record<string, string> = { laptopid: "Laptopid.ee", tech: "Techvision", foxway: "Foxway" };
const SUPPLIER_FILTER_CODES = Object.keys(SUPPLIER_FILTER_LABELS);

export function supplierFilterValue(supplier: string): string | null {
  const code = supplier.toLowerCase();
  return SUPPLIER_FILTER_CODES.includes(code) ? code : null;
}

/**
 * Tarne filter (sama reegel mis tootelehe tarneaja silt, configuration-line.ts): "kohapeal" = salongis olemas,
 * tarnija tarneaeg → "1-2" / "2-4"; tarneaeg teadmata → filtris ei osale (väärtust ei leiutata).
 */
export const IN_STORE_DELIVERY = "kohapeal";
const DELIVERY_RANGE = /^(\d{1,2})-(\d{1,2})$/;

export function deliveryFilterValue(variant: Pick<CatalogVariant, "stock" | "delivery">): string | null {
  if (isInStore(variant)) return IN_STORE_DELIVERY;
  return variant.delivery ? `${variant.delivery.minDays}-${variant.delivery.maxDays}` : null;
}

export function deliveryFilterLabel(value: string): string {
  if (value === IN_STORE_DELIVERY) return "Poes kohapeal";
  const [, min, max] = value.match(DELIVERY_RANGE) ?? [];
  if (!min) return value;
  return min === max ? `Tarne ${min} ${min === "1" ? "päev" : "päeva"}` : `Tarne ${min}–${max} päeva`;
}

/** Poes kohapeal ees, siis kiirem tarne enne */
function compareDelivery(a: string, b: string): number {
  const rank = (value: string) => {
    if (value === IN_STORE_DELIVERY) return [-1, -1];
    const [, min, max] = value.match(DELIVERY_RANGE) ?? [];
    return min ? [Number(min), Number(max)] : [Number.MAX_SAFE_INTEGER, 0];
  };
  const [aMin, aMax] = rank(a);
  const [bMin, bMax] = rank(b);
  return aMin - bMin || aMax - bMax;
}

/** "thinkpad-t" jne vastab ka üldisele "thinkpad" väärtusele (avalehe seeria lingid, vanad URL-id) */
const THINKPAD_PARENT_LINES = new Set(["thinkpad-t", "thinkpad-x", "thinkpad-x1", "thinkpad-x13", "thinkpad-l", "thinkpad-e"]);

// ---- Sildid ----------------------------------------------------------------

const storageLabel = (value: string) => {
  const gb = Number(value);
  if (gb >= 2048) return "2 TB+";
  if (gb >= 1024) return "1 TB";
  return `${gb} GB`;
};

const numeric = (a: string, b: string) => Number(a) - Number(b);
const byList = (list: readonly string[]) => (a: string, b: string) => list.indexOf(a) - list.indexOf(b);

// ---- Definitsioonid ---------------------------------------------------------

export const FACETS: Record<MultiFacetKey, FacetDefinition> = {
  delivery: {
    key: "delivery",
    label: "Tarne",
    valuesOf: ({ variant }) => {
      const value = deliveryFilterValue(variant);
      return value ? [value] : [];
    },
    optionLabel: deliveryFilterLabel,
    isValidValue: (v) => v === IN_STORE_DELIVERY || DELIVERY_RANGE.test(v),
    compare: compareDelivery,
  },
  supplier: {
    key: "supplier",
    label: "Tarnija",
    // Pakkumise (SupplierListing) tasemel: kaart = üks pakkumine, nii et filtreeritud kaardi link valib sama tarnija konfiguratsiooni
    valuesOf: ({ variant }) => {
      const value = supplierFilterValue(variant.supplier);
      return value ? [value] : [];
    },
    optionLabel: (v) => SUPPLIER_FILTER_LABELS[v] ?? v,
    isValidValue: (v) => SUPPLIER_FILTER_CODES.includes(v),
    compare: byList(SUPPLIER_FILTER_CODES),
  },
  brand: {
    key: "brand",
    label: "Tootja",
    valuesOf: ({ product }) => [product.brand],
    optionLabel: (v) => BRAND_NAMES[v as keyof typeof BRAND_NAMES] ?? v,
    isValidValue: (v) => (BRAND_CODES as readonly string[]).includes(v),
    compare: byList(BRAND_CODES),
  },
  series: {
    key: "series",
    label: "Seeria",
    valuesOf: ({ product }) => [seriesFilterValue(product)],
    matchValuesOf: ({ product }) => {
      const value = seriesFilterValue(product);
      return THINKPAD_PARENT_LINES.has(value) ? [value, "thinkpad"] : [value];
    },
    optionLabel: (v) => SERIES_LABELS[v] ?? v,
    isValidValue: (v) => SLUG_PATTERN.test(v),
    compare: compareSeries,
  },
  grade: {
    key: "grade",
    label: "Seisukord",
    valuesOf: ({ variant }) => [GRADES[variant.grade].param],
    optionLabel: (v) => {
      const grade = GRADE_CODES.find((code) => GRADES[code].param === v);
      return grade ? gradeDisplay(grade) : v;
    },
    isValidValue: (v) => GRADE_CODES.some((code) => GRADES[code].param === v),
    compare: byList(GRADE_CODES.map((code) => GRADES[code].param)),
  },
  screen: {
    key: "screen",
    label: "Ekraani suurus",
    valuesOf: ({ product }) => [screenBucket(product.screenSizeIn)],
    optionLabel: (v) => `${v}"`,
    isValidValue: (v) => ["13", "14", "15", "16", "17"].includes(v),
    compare: numeric,
  },
  ram: {
    key: "ram",
    label: "Mälu (RAM)",
    valuesOf: ({ variant }) => [ramBucket(variant.ramGb)],
    optionLabel: (v) => (v === "64" ? "64 GB+" : `${v} GB`),
    isValidValue: (v) => ["8", "16", "32", "64"].includes(v),
    compare: numeric,
  },
  ssd: {
    key: "ssd",
    label: "Kõvaketas (SSD)",
    valuesOf: ({ variant }) => [ssdBucket(variant.storageGb)],
    optionLabel: storageLabel,
    isValidValue: (v) => ["256", "512", "1024", "2048"].includes(v),
    compare: numeric,
  },
  cpu: {
    key: "cpu",
    label: "Protsessor",
    valuesOf: ({ variant }) => {
      const family = cpuFilterFamily(variant.cpu);
      return family ? [family] : [];
    },
    optionLabel: cpuFamilyLabel,
    isValidValue: isCpuFamilyValue,
    compare: compareCpuFamilies,
  },
  gen: {
    key: "gen",
    label: "Protsessori põlvkond",
    valuesOf: ({ variant }) => {
      const generation = cpuFilterGeneration(variant.cpu);
      return generation ? [generation] : [];
    },
    optionLabel: cpuGenerationLabel,
    isValidValue: isCpuGenerationValue,
    compare: compareCpuGenerations,
  },
  kb: {
    key: "kb",
    label: "Klaviatuur",
    // Valikud tulevad andmebaasist (ainult tegelikult müügis olevad paigutused, kõik tarnijad) — vt keyboard.ts
    valuesOf: ({ variant }) => (variant.keyboardLayout ? [keyboardFilterValue(variant.keyboardLayout)] : []),
    optionLabel: keyboardFilterLabel,
    isValidValue: (v) => KEYBOARD_FILTER_PATTERN.test(v),
    compare: compareKeyboardFilterValues,
  },
};

const SERIES_LABELS: Record<string, string> = {
  thinkpad: "Lenovo ThinkPad",
  "thinkpad-p": "Lenovo ThinkPad P",
  latitude: "Dell Latitude",
  precision: "Dell Precision",
  elitebook: "HP EliteBook",
  probook: "HP ProBook",
  zbook: "HP ZBook",
  thinkbook: "Lenovo ThinkBook",
  yoga: "Lenovo Yoga",
  xps: "Dell XPS",
  lifebook: "Fujitsu LifeBook",
  "galaxy-book": "Samsung Galaxy Book",
  "macbook-air": "Apple MacBook Air",
  "macbook-pro": "Apple MacBook Pro",
  "v-series": "Lenovo V-seeria",
  "thinkpad-t": "Lenovo ThinkPad T",
  "thinkpad-x": "Lenovo ThinkPad X",
  "thinkpad-x1": "Lenovo ThinkPad X1",
  "thinkpad-x13": "Lenovo ThinkPad X13",
  "thinkpad-l": "Lenovo ThinkPad L",
  "thinkpad-e": "Lenovo ThinkPad E",
};

/** Tootja järjekorras (Lenovo, Dell, HP …), tootja sees tähestikuliselt — Lenovo seeriad on eespool, mitte peidus */
function compareSeries(a: string, b: string): number {
  const labelA = seriesLabel(a);
  const labelB = seriesLabel(b);
  const brandRank = (label: string) => {
    const index = BRAND_CODES.findIndex((code) => label.startsWith(`${BRAND_NAMES[code]} `));
    return index === -1 ? BRAND_CODES.length : index;
  };
  return brandRank(labelA) - brandRank(labelB) || labelA.localeCompare(labelB, "et");
}

export function seriesLabel(slug: string): string {
  return SERIES_LABELS[slug] ?? slug;
}

/** Filtripaneelis kõige ees, enne hinda (Tarne → Tarnija → Hind → Tootja …) */
export const LEAD_FACETS: MultiFacetKey[] = ["delivery", "supplier"];
/** Basic filtrid on alati nähtaval; ülejäänud on "Täpsemad filtrid" all. */
export const PRIMARY_FACETS: MultiFacetKey[] = ["brand", "series", "grade", "screen", "ram", "ssd", "cpu", "gen"];
export const ADVANCED_FACETS: MultiFacetKey[] = ["kb"];

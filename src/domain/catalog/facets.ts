import { GRADES, GRADE_CODES } from "@/domain/grade/grades";
import {
  BRAND_CODES,
  BRAND_NAMES,
  CPU_FAMILIES,
  KEYBOARD_LAYOUTS,
  type CatalogItem,
  type CpuFamily,
} from "./types";

/**
 * Filtrite (facet'ite) definitsioonid — ÜKS koht, kust tulevad:
 * väärtused, sildid, järjekord ja URL-i parameetrid.
 * Filtripaneel, aktiivsete filtrite chip'id ja serveri filtreerimine kasutavad kõik seda.
 */

export const MULTI_FACET_KEYS = ["brand", "series", "grade", "screen", "ram", "ssd", "cpu", "gen", "kb"] as const;
export type MultiFacetKey = (typeof MULTI_FACET_KEYS)[number];

export interface FacetDefinition {
  key: MultiFacetKey;
  label: string;
  /** Väärtused, mille alla see toode kuulub (URL-i kujul). */
  valuesOf: (item: CatalogItem) => string[];
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

// ---- Sildid ----------------------------------------------------------------

const CPU_FAMILY_LABELS: Record<CpuFamily, string> = {
  "intel-core-i3": "Intel Core i3",
  "intel-core-i5": "Intel Core i5",
  "intel-core-i7": "Intel Core i7",
  "intel-core-i9": "Intel Core i9",
  "intel-core-ultra-5": "Intel Core Ultra 5",
  "intel-core-ultra-7": "Intel Core Ultra 7",
  "amd-ryzen-3": "AMD Ryzen 3",
  "amd-ryzen-5": "AMD Ryzen 5",
  "amd-ryzen-7": "AMD Ryzen 7",
  "amd-ryzen-9": "AMD Ryzen 9",
};

export function cpuFamilyLabel(family: string): string {
  return CPU_FAMILY_LABELS[family as CpuFamily] ?? family;
}

/** "intel-12" → "Intel 12. põlvkond", "amd-5000" → "Ryzen 5000-seeria", "ultra-1" → "Core Ultra (seeria 1)" */
export function cpuGenerationLabel(key: string): string {
  const [vendor, value] = key.split("-");
  if (vendor === "intel") return `Intel ${value}. põlvkond`;
  if (vendor === "ultra") return `Core Ultra (seeria ${value})`;
  if (vendor === "amd") return `Ryzen ${value}-seeria`;
  return key;
}

/** Võrreldav "uudsuse" number eri tootjate põlvkondadele (sorteerimiseks). */
export function cpuGenerationRank(key: string | null): number {
  if (!key) return 0;
  const [vendor, raw] = key.split("-");
  const value = Number(raw);
  if (vendor === "intel") return value;
  if (vendor === "ultra") return 13 + value;
  if (vendor === "amd") return 6 + value / 1000; // Ryzen 5000 ≈ Intel 11. põlvkonna ajastu
  return 0;
}

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
    valuesOf: ({ product }) => [seriesSlug(product.series)],
    optionLabel: (v) => SERIES_LABELS[v] ?? v,
    isValidValue: (v) => SLUG_PATTERN.test(v),
    compare: (a, b) => (SERIES_LABELS[a] ?? a).localeCompare(SERIES_LABELS[b] ?? b, "et"),
  },
  grade: {
    key: "grade",
    label: "Seisukord",
    valuesOf: ({ variant }) => [GRADES[variant.grade].param],
    optionLabel: (v) => {
      const grade = GRADE_CODES.find((code) => GRADES[code].param === v);
      return grade ? `${grade} · ${GRADES[grade].label}` : v;
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
    valuesOf: ({ variant }) => (variant.cpu.family ? [variant.cpu.family] : []),
    optionLabel: cpuFamilyLabel,
    isValidValue: (v) => (CPU_FAMILIES as readonly string[]).includes(v),
    compare: byList(CPU_FAMILIES),
  },
  gen: {
    key: "gen",
    label: "Protsessori põlvkond",
    valuesOf: ({ variant }) => (variant.cpu.generationKey ? [variant.cpu.generationKey] : []),
    optionLabel: cpuGenerationLabel,
    isValidValue: (v) => /^(intel|ultra|amd)-\d{1,4}$/.test(v),
    compare: (a, b) => cpuGenerationRank(b) - cpuGenerationRank(a),
  },
  kb: {
    key: "kb",
    label: "Klaviatuur",
    valuesOf: ({ variant }) => (variant.keyboardLayout ? [variant.keyboardLayout.toLowerCase()] : []),
    optionLabel: (v) => KEYBOARD_LABELS[v] ?? v.toUpperCase(),
    isValidValue: (v) => (KEYBOARD_LAYOUTS as readonly string[]).includes(v.toUpperCase()),
    compare: byList(KEYBOARD_LAYOUTS.map((k) => k.toLowerCase())),
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
};

export function seriesLabel(slug: string): string {
  return SERIES_LABELS[slug] ?? slug;
}

const KEYBOARD_LABELS: Record<string, string> = {
  swe: "Rootsi/Soome (SWE)",
  nor: "Norra (NOR)",
  est: "Eesti (EST)",
  us: "USA (US)",
  uk: "Inglise (UK)",
  de: "Saksa (DE)",
};

/** Basic filtrid on alati nähtaval; ülejäänud on "Täpsemad filtrid" all. */
export const PRIMARY_FACETS: MultiFacetKey[] = ["brand", "series", "grade", "screen", "ram", "ssd", "cpu", "gen"];
export const ADVANCED_FACETS: MultiFacetKey[] = ["kb"];

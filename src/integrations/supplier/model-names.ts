import type { BrandCode } from "@/domain/catalog/types";

/**
 * Tootja ja mudelinime ühtlustamine (jagatud kõigi adapterite vahel).
 * "ThinkPad P1 Gen 4" → seeria "ThinkPad P", mudel "P1 Gen 4"
 */

const BRAND_ALIASES: Record<string, BrandCode> = {
  lenovo: "lenovo",
  dell: "dell",
  "dell technologies": "dell",
  hp: "hp",
  "hewlett-packard": "hp",
  "hp inc.": "hp",
  fujitsu: "fujitsu",
  samsung: "samsung",
  apple: "apple",
};

export function parseBrand(raw: string): BrandCode | null {
  return BRAND_ALIASES[raw.trim().toLowerCase()] ?? null;
}

/** Järjekord on oluline: spetsiifilisem enne ("ThinkPad P" enne "ThinkPad"). Mudelinimest eemaldatakse sobinud eesliide. */
const SERIES_PATTERNS: { pattern: RegExp; series: string }[] = [
  { pattern: /^ThinkPad\s+(?=P\d)/i, series: "ThinkPad P" },
  { pattern: /^ThinkPad\s+/i, series: "ThinkPad" },
  { pattern: /^ThinkBook\s+/i, series: "ThinkBook" },
  { pattern: /^Yoga\s+/i, series: "Yoga" },
  { pattern: /^Latitude\s+/i, series: "Latitude" },
  { pattern: /^Precision\s+/i, series: "Precision" },
  { pattern: /^XPS\s+/i, series: "XPS" },
  { pattern: /^EliteBook\s+/i, series: "EliteBook" },
  { pattern: /^ProBook\s+/i, series: "ProBook" },
  { pattern: /^ZBook\s+/i, series: "ZBook" },
  { pattern: /^LifeBook\s+/i, series: "LifeBook" },
  { pattern: /^Galaxy\s+Book\s*/i, series: "Galaxy Book" },
  { pattern: /^MacBook\s+Air\s*/i, series: "MacBook Air" },
  { pattern: /^MacBook\s+Pro\s*/i, series: "MacBook Pro" },
];

export function splitSeries(modelName: string): { series: string; model: string } | null {
  const name = modelName.replace(/\s+/g, " ").trim();
  for (const { pattern, series } of SERIES_PATTERNS) {
    const match = name.match(pattern);
    if (match) {
      // "ThinkPad P" seeria puhul jääb mudelinimesse "P1 Gen 4"
      const model = name.slice(match[0].length).trim();
      return model ? { series, model } : null;
    }
  }
  return null;
}

/**
 * Mudelinime kanooniline kuju, et eri tarnijate kirjapildid annaksid sama mudeli:
 *  - Lenovo ThinkPad: "T14 G3" → "T14 Gen 3" (Lenovo ametlik nimi; mock-andmetes juba nii)
 *  - "2in1" → "2-in-1", " - " eraldaja eemaldatakse, tühikud ühtlustatakse
 * Muid mudeleid (HP "840 G8", Dell "5430") ei muudeta — nende ametlik nimi ongi selline.
 */
export function canonicalModelName(series: string, model: string): string {
  let name = model
    .replace(/\s+-\s+/g, " ")
    .replace(/\b2\s*in\s*1\b/gi, "2-in-1")
    .replace(/\s+/g, " ")
    .trim();
  if (series === "ThinkPad" || series === "ThinkPad P") name = name.replace(/\bG(\d{1,2})\b/g, "Gen $1");
  return name;
}

export function slugify(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

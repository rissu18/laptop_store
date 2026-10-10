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
};

export function parseBrand(raw: string): BrandCode | null {
  return BRAND_ALIASES[raw.trim().toLowerCase()] ?? null;
}

/** Järjekord on oluline: spetsiifilisem enne ("ThinkPad P" enne "ThinkPad"). */
const SERIES_PATTERNS: { pattern: RegExp; series: string }[] = [
  { pattern: /^ThinkPad\s+(?=P\d)/i, series: "ThinkPad P" },
  { pattern: /^ThinkPad\s+/i, series: "ThinkPad" },
  { pattern: /^Latitude\s+/i, series: "Latitude" },
  { pattern: /^Precision\s+/i, series: "Precision" },
  { pattern: /^EliteBook\s+/i, series: "EliteBook" },
  { pattern: /^ProBook\s+/i, series: "ProBook" },
  { pattern: /^ZBook\s+/i, series: "ZBook" },
];

export function splitSeries(modelName: string): { series: string; model: string } | null {
  const name = modelName.replace(/\s+/g, " ").trim();
  for (const { pattern, series } of SERIES_PATTERNS) {
    if (pattern.test(name)) {
      // "ThinkPad P" seeria puhul jääb mudelinimesse "P1 Gen 4"
      return { series, model: name.replace(/^\S+\s+/, "") };
    }
  }
  return null;
}

export function slugify(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

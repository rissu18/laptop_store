import { BRAND_NAMES, type CatalogItem } from "./types";

/**
 * Otsing.
 * Phase 1: TypeScriptis mälus. Phase 2: sama loogika PostgreSQL-is (pg_trgm indeks `searchText` veerul).
 *
 * Põhimõte: päring jagatakse sõnadeks ja IGA sõna peab leiduma (AND).
 * Sõna leitakse, kui mõni otsinguteksti sõna algab sellega:
 *   "840 g8"     → "hp elitebook 840 g8"
 *   "t14 16 512" → T14 + "16gb" + "512gb"
 */

export function normalizeSearchText(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9.+]+/g, " ")
    .trim();
}

export function tokenize(text: string): string[] {
  return normalizeSearchText(text).split(" ").filter(Boolean);
}

/** Toote otsingutekst (Phase 2-s salvestatakse see andmebaasi veergu). */
export function buildSearchText({ product, variant }: CatalogItem): string {
  const parts = [
    BRAND_NAMES[product.brand],
    product.series,
    product.model,
    variant.cpu.model,
    // "i5-1235U" → ka "1235u", et "1235u" leiaks
    variant.cpu.model.replace(/^.*?-/, ""),
    `${variant.ramGb}gb`,
    `${variant.ramGb} gb ram`,
    variant.storageGb >= 1024 ? `${variant.storageGb / 1024}tb` : `${variant.storageGb}gb`,
    `${variant.storageGb}gb ssd`,
    `${product.screenSizeIn}"`,
    variant.gpu.model,
    variant.sku,
    `grade ${variant.grade}`,
  ];
  return normalizeSearchText(parts.join(" "));
}

export function matchesSearch(searchText: string, queryTokens: string[]): boolean {
  if (queryTokens.length === 0) return true;
  const words = searchText.split(" ");
  return queryTokens.every((token) => words.some((word) => word.startsWith(token)));
}

/** Autocomplete'i järjestamiseks: täpsed sõnavasted kaaluvad rohkem kui prefiksid. */
export function searchScore(searchText: string, queryTokens: string[]): number {
  const words = searchText.split(" ");
  return queryTokens.reduce((score, token) => {
    if (words.includes(token)) return score + 2;
    if (words.some((word) => word.startsWith(token))) return score + 1;
    return score;
  }, 0);
}

import { isModelIssue } from "./data-quality-rules";

/**
 * Andmekvaliteedi skoop: "Müügis" (vaikimisi — ainult poes nähtavad pakkumised ja nende mudelid) või "Kõik".
 * URL-is: /admin/data-quality (müügis) ja /admin/data-quality?scope=all.
 */
export type DataQualityScope = "sellable" | "all";

export function parseDataQualityScope(value: unknown): DataQualityScope {
  return value === "all" ? "all" : "sellable";
}

/**
 * Kategooria → mõjutatud kirjete nimekiri. Skoop säilib: "Müügis" → nimekirja filter `scope=sellable`
 * (sama reegel mis pood); "Kõik" → ilma skoobita.
 */
export function issueHref(issue: string, scope: DataQualityScope): string {
  const base = isModelIssue(issue) ? "/admin/products/models" : "/admin/products/listings";
  return `${base}?issue=${encodeURIComponent(issue)}${scope === "sellable" ? "&scope=sellable" : ""}`;
}

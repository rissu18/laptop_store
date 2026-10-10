import { cpuTier, isHighPerformanceCpu } from "./spec-explanations";
import type { CatalogItem } from "./types";

/**
 * "Sarnased sülearvutid" — deterministlik järjestus.
 *
 * Kohustuslik piirang: hind ±25% praeguse toote hinnast. Kui vahemikus pole piisavalt tooteid,
 * näidatakse nii palju kui leidub (2× kallimaid või poole odavamaid EI pakuta).
 * Tootja ei ole piirang — Lenovo vaatajale võib soovitada ka Delli või HP-d.
 *
 * Välja jäetakse: sama pakkumine ja sama mudeli teised konfiguratsioonid (need on tootelehel
 * konfiguratsiooni valikus juba olemas), samuti mitu sama mudeli pakkumist järjest.
 */

export const SIMILAR_PRICE_TOLERANCE = 0.25;

/** Kasutusklass: mobiilne tööjaam vs tavaline äriklass. */
function usageClass(item: CatalogItem): "workstation" | "business" {
  const series = item.product.series;
  if (series === "Precision" || series === "ThinkPad P" || series === "ZBook") return "workstation";
  return item.variant.gpu.dedicated ? "workstation" : "business";
}

function effectiveCpuTier(item: CatalogItem): number {
  return (cpuTier(item.variant.cpu.family) ?? 2) + (isHighPerformanceCpu(item.variant.cpu.model) ? 1 : 0);
}

const log2 = (n: number) => Math.log2(Math.max(1, n));

export interface SimilarityScore {
  item: CatalogItem;
  score: number;
}

export function similarityScore(current: CatalogItem, candidate: CatalogItem): number {
  const a = current;
  const b = candidate;
  let score = 0;

  // 2. ekraani suurus
  const screenDiff = Math.abs(a.product.screenSizeIn - b.product.screenSizeIn);
  score += screenDiff < 0.5 ? 30 : screenDiff <= 1.3 ? 15 : 0;

  // 3. protsessori klass
  const cpuDiff = Math.abs(effectiveCpuTier(a) - effectiveCpuTier(b));
  score += cpuDiff === 0 ? 20 : cpuDiff === 1 ? 10 : 0;

  // 4. RAM (8 → 16 → 32 → 64 on üks samm)
  const ramDiff = Math.abs(log2(a.variant.ramGb) - log2(b.variant.ramGb));
  score += ramDiff === 0 ? 15 : ramDiff <= 1 ? 7 : 0;

  // 5. SSD
  const ssdDiff = Math.abs(log2(a.variant.storageGb) - log2(b.variant.storageGb));
  score += ssdDiff === 0 ? 10 : ssdDiff <= 1 ? 5 : 0;

  // 6. kasutusklass
  score += usageClass(a) === usageClass(b) ? 10 : 0;

  // 7. teine tootja — et klient näeks päris alternatiive (boonus, mitte nõue)
  score += a.product.brand !== b.product.brand ? 5 : 0;

  // Viigi korral eelistatakse lähemat hinda (0–5 punkti)
  const priceDiff = Math.abs(a.variant.price.saleCents - b.variant.price.saleCents) / a.variant.price.saleCents;
  score += Math.round((1 - priceDiff / SIMILAR_PRICE_TOLERANCE) * 5 * 10) / 10;

  return score;
}

export function isWithinPriceRange(current: CatalogItem, candidate: CatalogItem): boolean {
  const price = current.variant.price.saleCents;
  const diff = Math.abs(candidate.variant.price.saleCents - price);
  return diff <= price * SIMILAR_PRICE_TOLERANCE;
}

export function findSimilarItems(current: CatalogItem, candidates: CatalogItem[], limit = 4): CatalogItem[] {
  const ranked = candidates
    .filter(
      (candidate) =>
        candidate.variant.id !== current.variant.id &&
        candidate.product.slug !== current.product.slug &&
        candidate.variant.stock.quantity > 0 &&
        isWithinPriceRange(current, candidate), // 1. hind ±25% — kohustuslik
    )
    .map((item) => ({ item, score: similarityScore(current, item) }))
    .sort((x, y) => y.score - x.score || x.item.variant.sku.localeCompare(y.item.variant.sku));

  // Üks pakkumine mudeli kohta, et soovitused oleksid mitmekesised
  const seenModels = new Set<string>();
  const result: CatalogItem[] = [];
  for (const { item } of ranked) {
    if (seenModels.has(item.product.slug)) continue;
    seenModels.add(item.product.slug);
    result.push(item);
    if (result.length >= limit) break;
  }
  return result;
}

import { describe, expect, it } from "vitest";
import { pricingConfig } from "@/config/pricing";
import { MockSupplierAdapter } from "@/integrations/supplier/mock/mock-supplier-adapter";
import { buildCatalog } from "@/server/catalog/build-catalog";
import type { CatalogItem } from "@/domain/catalog/types";
import { inBudget, recommendLaptops, scoreItem, type FinderAnswers } from "./finder";

async function catalog(): Promise<CatalogItem[]> {
  const source = await new MockSupplierAdapter().getProducts();
  return buildCatalog(source, { pricing: pricingConfig, featuredExternalIds: [], lastSyncedAt: null }).items;
}

const combos: FinderAnswers[] = [
  { purpose: "work", budget: "300-500", carry: "sometimes", priorities: [] },
  { purpose: "travel", budget: "300-500", carry: "daily", priorities: ["light"] },
  { purpose: "programming", budget: "700-1000", carry: "rarely", priorities: ["ram", "fast-cpu"] },
  { purpose: "design", budget: "1000+", carry: "rarely", priorities: ["big-screen"] },
  { purpose: "school", budget: "0-300", carry: "daily", priorities: [] },
  { purpose: "home", budget: "300-500", carry: "rarely", priorities: ["numpad", "big-screen"] },
];

describe("laptop finder", () => {
  it("soovitused jäävad eelarvesse ja on eri mudelid", async () => {
    const items = await catalog();
    for (const answers of combos) {
      const result = recommendLaptops(items, answers);
      const picks = [result.best, result.cheapest, result.strongest].filter((p) => p !== null);
      expect(picks.length).toBeGreaterThan(0);
      for (const pick of picks) expect(inBudget(pick!.item, answers.budget)).toBe(true);
      expect(new Set(picks.map((p) => p!.item.product.slug)).size).toBe(picks.length);
    }
  });

  it("eri vastused annavad erinevad soovitused (vähemalt 5 kombinatsiooni)", async () => {
    const items = await catalog();
    const bests = combos.map((answers) => recommendLaptops(items, answers).best!.item.variant.id);
    expect(new Set(bests).size).toBeGreaterThanOrEqual(5);
  });

  it("disainitöö eelistab eraldi graafikakaarti, reisimine kerget arvutit", async () => {
    const items = await catalog();
    expect(recommendLaptops(items, combos[3]).best!.item.variant.gpu.dedicated).toBe(true);
    const travel = recommendLaptops(items, combos[1]).best!.item;
    expect(travel.product.weightKg).not.toBeNull();
    expect(travel.product.weightKg!).toBeLessThanOrEqual(1.4);
  });

  it("puuduvate andmete eest punkte ei anta (nt aku, kaal)", async () => {
    const [item] = await catalog();
    const unknown: CatalogItem = {
      product: { ...item.product, weightKg: null },
      variant: { ...item.variant, batteryHealthPct: null },
    };
    const answers: FinderAnswers = { purpose: "travel", budget: "1000+", carry: "daily", priorities: ["battery", "light"] };
    const reasons = scoreItem(unknown, answers).reasons.map((r) => r.text);
    expect(reasons.some((r) => /aku/i.test(r))).toBe(false);
    expect(reasons.some((r) => /kerge|kaal/i.test(r))).toBe(false);
  });

  it("annab põhjendused punktide järjekorras", async () => {
    const items = await catalog();
    const best = recommendLaptops(items, combos[2]).best!;
    expect(best.reasons.length).toBeGreaterThan(0);
    for (let i = 1; i < best.reasons.length; i++) expect(best.reasons[i - 1].points).toBeGreaterThanOrEqual(best.reasons[i].points);
  });

  it("link kõikidele sobivatele kasutab eelarvet ja valitud omadusi", async () => {
    const items = await catalog();
    const href = recommendLaptops(items, { purpose: "home", budget: "300-500", carry: "rarely", priorities: ["numpad"] }).allMatchingHref;
    expect(href).toContain("min=300");
    expect(href).toContain("max=500");
    expect(href).toContain("numpad");
  });
});

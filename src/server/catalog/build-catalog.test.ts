import { describe, expect, it } from "vitest";
import { pricingConfig } from "@/config/pricing";
import { computeFacets, filterItems, sortItems } from "@/domain/catalog/filtering";
import { emptyQuery, parseCatalogQuery } from "@/domain/catalog/query";
import { MockSupplierAdapter } from "@/integrations/supplier/mock/mock-supplier-adapter";
import { MOCK_SUPPLIER_RECORDS } from "@/integrations/supplier/mock/mock-supplier-data";
import { groupOffersIntoModels } from "@/server/images/product-models";
import { buildCatalog } from "./build-catalog";

async function catalog() {
  const source = await new MockSupplierAdapter().getProducts();
  return buildCatalog(source, {
    pricing: pricingConfig,
    featuredExternalIds: [],
    delivery: { minDays: 2, maxDays: 4 },
    lastSyncedAt: null,
  });
}

describe("tarnija → kataloog", () => {
  it("lükkab tundmatu seisukorraga kirje tagasi, mitte ei pane seda poodi", async () => {
    const { items, issues } = await catalog();
    expect(issues).toContainEqual(expect.objectContaining({ externalId: "MS-99999", stage: "normalize" }));
    expect(items.some((item) => item.variant.sku === "SP-99999")).toBe(false);
  });

  it("hinnastab iga toote ostuhinnast kõrgemale", async () => {
    const { items } = await catalog();
    const costBySku = new Map(MOCK_SUPPLIER_RECORDS.map((r) => [`SP-${r.sku.replace("MS-", "")}`, r.price_eur * 100]));
    for (const { variant } of items) {
      expect(variant.price.saleCents).toBeGreaterThan(costBySku.get(variant.sku)!);
    }
  });

  it("koondab sama mudeli konfiguratsioonid ühe tootelehe alla", async () => {
    const { items } = await catalog();
    const t14 = items.filter((item) => item.product.slug === "lenovo-thinkpad-t14-gen-3");
    expect(t14).toHaveLength(3);
  });

  it("mudeli pildid on jagatud kõigi selle mudeli konfiguratsioonide vahel (üks kirje, mitte koopiad)", async () => {
    const source = await new MockSupplierAdapter().getProducts();
    const image = { thumbnailUrl: "/t", mediumUrl: "/m", largeUrl: "/l", width: 1, height: 1, alt: "T14", type: "MODEL_GENERIC" as const };
    const { items } = buildCatalog(source, {
      pricing: pricingConfig,
      featuredExternalIds: [],
      delivery: { minDays: 2, maxDays: 4 },
      lastSyncedAt: null,
      modelImages: { "lenovo-thinkpad-t14-gen-3": [image] },
    });
    const t14 = items.filter((item) => item.product.slug === "lenovo-thinkpad-t14-gen-3");
    expect(t14.length).toBe(3);
    expect(new Set(t14.map((item) => item.product.images)).size).toBe(1);
    expect(t14[0].product.images).toEqual([image]);
    // Teise mudeli pakkumised pilte ei saa
    expect(items.find((item) => item.product.slug === "lenovo-thinkpad-t14-gen-2")?.product.images).toEqual([]);
  });

  it("piltide import teeb ühe päringu mudeli, mitte konfiguratsiooni kohta", async () => {
    const { offers } = await new MockSupplierAdapter().getProducts();
    const models = groupOffersIntoModels(offers);
    const t14 = models.filter((m) => m.model.id === "lenovo-thinkpad-t14-gen-3");
    expect(t14).toHaveLength(1);
    expect(t14[0].offerCount).toBe(3);
    expect(models.length).toBeLessThan(offers.length);
  });

  it("ThinkPad P seeria saab õige pealkirja ja seeria", async () => {
    const { items } = await catalog();
    const p1 = items.find((item) => item.product.model === "P1 Gen 4")!;
    expect(p1.product.title).toBe("Lenovo ThinkPad P1 Gen 4");
    expect(p1.product.series).toBe("ThinkPad P");
  });
});

describe("otsing", () => {
  it('"840 g8" leiab HP EliteBook 840 G8', async () => {
    const { items } = await catalog();
    const found = filterItems(items, { ...emptyQuery(), q: "840 g8" });
    expect(found.length).toBeGreaterThan(0);
    expect(found.every((item) => item.product.title === "HP EliteBook 840 G8")).toBe(true);
  });

  it('"t14 16 512" leiab T14 konfiguratsiooni 16 GB / 512 GB', async () => {
    const { items } = await catalog();
    const found = filterItems(items, { ...emptyQuery(), q: "t14 16 512" });
    expect(found.length).toBeGreaterThan(0);
    for (const { product, variant } of found) {
      expect(product.model).toMatch(/^T14/);
      expect(variant.ramGb).toBe(16);
      expect(variant.storageGb).toBe(512);
    }
  });
});

describe("filtrid", () => {
  it("sama filtri valikud on VÕI, eri filtrid JA", async () => {
    const { items } = await catalog();
    const query = parseCatalogQuery({ ram: "16,32", brand: "dell" });
    const found = filterItems(items, query);
    expect(found.length).toBeGreaterThan(0);
    expect(found.every((i) => i.product.brand === "dell" && [16, 32].includes(i.variant.ramGb))).toBe(true);
  });

  it("facet'i loendur ei arvesta sama filtri teisi valikuid", async () => {
    const { items } = await catalog();
    const query = parseCatalogQuery({ brand: "dell" });
    const facets = computeFacets(items, query);
    const lenovo = facets.multi.brand.find((o) => o.value === "lenovo")!;
    expect(lenovo.count).toBe(items.filter((i) => i.product.brand === "lenovo").length);
  });

  it("ei näita omadusi, mida ühelgi tootel pole", async () => {
    const { items } = await catalog();
    const lenovoOnly = parseCatalogQuery({ brand: "lenovo", screen: "13" });
    const facets = computeFacets(items, lenovoOnly);
    expect(facets.features.find((f) => f.value === "numpad")).toBeUndefined();
  });

  it("lükkab URL-ist tulnud tundmatud väärtused tagasi", () => {
    const query = parseCatalogQuery({ ram: "16,999,<script>", sort: "drop table", page: "-3", min: "abc" });
    expect(query.facets.ram).toEqual(["16"]);
    expect(query.sort).toBe("recommended");
    expect(query.page).toBe(1);
    expect(query.minPrice).toBeNull();
  });

  it("sorteerib hinna järgi", async () => {
    const { items } = await catalog();
    const sorted = sortItems(items, "price-asc");
    for (let i = 1; i < sorted.length; i++) {
      expect(sorted[i].variant.price.saleCents).toBeGreaterThanOrEqual(sorted[i - 1].variant.price.saleCents);
    }
  });
});

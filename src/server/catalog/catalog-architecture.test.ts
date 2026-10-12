import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { cardImageView, type ProductImageView } from "@/domain/images/product-image";

/**
 * Jõudluse arhitektuuri lepingud (2026-10-12): poe lehed ei loe kogu kataloogi. Kogu kataloogi laadija
 * (loadDbCatalogItems) on ainult laptop finderi jaoks; kataloog, tooteleht, avaleht ja ostukorv kasutavad
 * kitsaid SQL-päringuid (catalog-queries.ts). Andmebaasi käitumist kontrollib catalog-queries.db.test.ts.
 */

const source = (path: string) => readFileSync(path, "utf8");

describe("kataloogi lugemistee leping", () => {
  it("täiskataloogi laadijat kasutab ainult getAllItems (laptop finder)", () => {
    const service = source("src/server/catalog/catalog-service.ts");
    expect(service.match(/loadDbCatalogItems\(/g)).toHaveLength(1);
    expect(service).toMatch(/async function cachedAllDbItems\(\)[\s\S]{0,80}loadDbCatalogItems\(\)/);
    for (const page of [
      "src/app/(shop)/toode/[slug]/page.tsx",
      "src/app/(shop)/sulearvutid/catalog-listing.tsx",
      "src/app/(shop)/page.tsx",
      "src/server/cart/cart-actions.ts",
    ]) {
      expect(source(page), page).not.toMatch(/getAllItems|loadDbCatalogItems|queryStorefrontCatalogRows/);
    }
  });

  it("tooteleht ja kataloog kasutavad otsepäringuid", () => {
    const service = source("src/server/catalog/catalog-service.ts");
    expect(service).toMatch(/queryProductDetail\(getDb\(\), slug\)/);
    expect(service).toMatch(/queryCatalogPage\(getDb\(\), query, locked\)/);
  });

  it("kataloogi lehekülje päring filtreerib SQL-is ja kasutab LIMIT/OFFSET-i", () => {
    const queries = source("src/server/catalog/catalog-queries.ts");
    expect(queries).toMatch(/FROM storefront WHERE \$\{where\} ORDER BY \$\{orderBy\(effective\.sort\)\} LIMIT \$\{PAGE_SIZE\} OFFSET \$\{offset\}/);
    // Kasutaja sisend ei lähe sql.raw'sse
    expect(queries).not.toMatch(/sql\.raw\(\s*(query|raw|q|token|value)/);
  });
});

describe("kaardi pildid", () => {
  const image = (largeUrl: string): ProductImageView => ({ thumbnailUrl: "/t.webp", mediumUrl: "/m.webp", largeUrl, width: 800, height: 600, alt: "pilt", type: "MODEL_GENERIC" });

  it("tarnija kaugpilt: ainult largeUrl (Next/Image); meie fail: thumbnail + medium", () => {
    expect(cardImageView(image("https://laptopid.ee/images/product/1.png"))).toMatchObject({ thumbnailUrl: "", mediumUrl: "", largeUrl: "https://laptopid.ee/images/product/1.png" });
    expect(cardImageView(image("/l.webp"))).toMatchObject({ thumbnailUrl: "/t.webp", mediumUrl: "/m.webp", largeUrl: "" });
  });
});

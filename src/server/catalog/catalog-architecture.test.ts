import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { toCardItem } from "@/domain/catalog/card";
import type { CatalogItem } from "@/domain/catalog/types";
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
      "src/app/api/catalog/route.ts",
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

describe("rikastus ei jookse lehe renderdamisel (LOCAL-FIRST)", () => {
  // Poe lugemistee: lehed → catalog-service → SQL-päringud → mapper → komponendid. Ükski neist ei tohi küsida
  // Laptopid.ee API-t, Icecatit ega käivitada rikastust — rikastuse tulemus on juba meie andmebaasis.
  const STOREFRONT_PATH = [
    "src/app/(shop)/toode/[slug]/page.tsx",
    "src/app/(shop)/sulearvutid/catalog-listing.tsx",
    "src/app/(shop)/page.tsx",
    "src/app/api/catalog/route.ts",
    "src/server/catalog/catalog-service.ts",
    "src/server/catalog/catalog-queries.ts",
    "src/server/catalog/db-catalog.ts",
    "src/server/catalog/db-catalog-mapper.ts",
    "src/components/product/quick-specs.tsx",
    "src/components/product/spec-sections.tsx",
    "src/domain/catalog/enrichment.ts",
    "src/domain/catalog/quick-specs.ts",
  ];

  it.each(STOREFRONT_PATH)("%s ei impordi välisallikaid ega rikastusteenust", (file) => {
    const code = source(file);
    expect(code).not.toMatch(/@\/integrations\/icecat|@\/integrations\/laptopid\/laptopid-client|@\/server\/enrichment|@\/server\/images\/icecat-image-import/);
    expect(code).not.toMatch(/\bfetch\(\s*["'`]https?:/);
  });

  it("mapper rakendab rikastust ainult andmebaasi väljast (supplier_listings.enrichment)", () => {
    const mapper = source("src/server/catalog/db-catalog-mapper.ts");
    expect(mapper).toContain("applyListingEnrichment(effectiveListing(raw), raw.enrichment)");
    expect(mapper).toMatch(/STOREFRONT_LISTING_COLUMNS = \[[\s\S]*"enrichment"/);
  });
});

describe("kaardi pildid", () => {
  const image = (largeUrl: string): ProductImageView => ({ thumbnailUrl: "/t.webp", mediumUrl: "/m.webp", largeUrl, width: 800, height: 600, alt: "pilt", type: "MODEL_GENERIC" });

  it("tarnija kaugpilt: ainult largeUrl (Next/Image); meie fail: thumbnail + medium", () => {
    expect(cardImageView(image("https://laptopid.ee/images/product/1.png"))).toMatchObject({ thumbnailUrl: "", mediumUrl: "", largeUrl: "https://laptopid.ee/images/product/1.png" });
    expect(cardImageView(image("/l.webp"))).toMatchObject({ thumbnailUrl: "/t.webp", mediumUrl: "/m.webp", largeUrl: "" });
  });
});

describe("filtri vastus (/api/catalog)", () => {
  it("saadab kaardi andmed (toCardItem), mitte toorandmeid; laoseis ei muutu", () => {
    const route = source("src/app/api/catalog/route.ts");
    expect(route).toContain("items.map(toCardItem)");
    expect(route).toMatch(/no-store/);
    const img: ProductImageView = { thumbnailUrl: "/t", mediumUrl: "/m", largeUrl: "/l", width: 1, height: 1, alt: "a", type: "MODEL_GENERIC" };
    const item = {
      product: { images: [img] },
      variant: { images: [], details: { ports: "x" }, conditionNotes: "kriimustus", stock: { available: true, quantity: null } },
    } as unknown as CatalogItem;
    const card = toCardItem(item);
    expect(card.variant.details).toEqual({});
    expect(card.variant.conditionNotes).toBeNull();
    expect(card.variant.stock).toEqual({ available: true, quantity: null });
    expect(card.product.images).toEqual([{ ...img, largeUrl: "" }]);
  });

  it("kliendi olek: AbortController katkestab vanema päringu, filtrilingid ei tee Next eellaadimist", () => {
    const nav = source("src/components/catalog/catalog-navigation.tsx");
    expect(nav).toContain("new AbortController()");
    expect(nav).toContain("return () => controller.abort()");
    expect(nav).toContain("fetch(`/api/catalog?");
    expect(source("src/components/catalog/listing-controls.tsx")).not.toContain("from \"next/link\"");
  });
});

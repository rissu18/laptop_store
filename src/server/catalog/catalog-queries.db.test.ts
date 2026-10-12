import { asc, eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { createTestDatabase, hasTestDatabase, type TestDatabase } from "@/test/test-db";
import { computeFacets, filterItems, sortItems, type SearchableItem } from "@/domain/catalog/filtering";
import { MULTI_FACET_KEYS } from "@/domain/catalog/facets";
import { PAGE_SIZE, SORT_OPTIONS, parseCatalogQuery, type RawSearchParams } from "@/domain/catalog/query";
import { listingImages, productImages, productModels, supplierListings } from "@/server/db/schema";

/**
 * Kataloogi SQL-päringud (catalog-queries.ts) päris PostgreSQL-is, ajutises skeemis.
 * Arhitektuuri leping: filtrid, tahud, sorteerimine ja LIMIT käivad andmebaasis, tulemus on TÄPSELT sama mis
 * varasemal täiskataloogi mälus filtreerimisel; tooteleht ja ostukorv loevad ainult oma mudelid.
 */

vi.mock("server-only", () => ({}));
vi.mock("@/server/logging/system-log", () => ({ writeSystemLog: async () => {}, newErrorId: () => "TESTID", errorMessage: (e: unknown) => String(e) }));

describe.skipIf(!hasTestDatabase)("kataloogi SQL-päringud (andmebaas)", () => {
  let t: TestDatabase;
  let all: SearchableItem[];
  const skus: Record<string, string> = {};

  beforeAll(async () => {
    t = await createTestDatabase();
    const { seedCatalog } = await import("@/server/db/seed/seed-catalog");
    const { loadSeedSources } = await import("@/server/db/seed/seed-sources");
    await seedCatalog(t.db, (await loadSeedSources()).sources);

    const rows = await t.db.select().from(supplierListings).orderBy(asc(supplierListings.sku)).limit(6);
    const [archived, unknownQty, exactQty, outOfStock, ramOverride, priceOverride] = rows;
    Object.assign(skus, { archived: archived.sku, unknownQty: unknownQty.sku, exactQty: exactQty.sku, outOfStock: outOfStock.sku, ramOverride: ramOverride.sku });
    await t.db.update(supplierListings).set({ status: "ARCHIVED" }).where(eq(supplierListings.id, archived.id));
    // Laptopid.ee: saadaval, täpne kogus teadmata
    await t.db.update(supplierListings).set({ available: true, stock: null }).where(eq(supplierListings.id, unknownQty.id));
    // Tech: täpne kogus
    await t.db.update(supplierListings).set({ available: true, stock: 4 }).where(eq(supplierListings.id, exactQty.id));
    await t.db.update(supplierListings).set({ stock: 0 }).where(eq(supplierListings.id, outOfStock.id));
    // Admini parandused peavad kehtima ka SQL-i filtris
    await t.db.update(supplierListings).set({ manualOverrides: { ramGb: 64, stock: 2 } }).where(eq(supplierListings.id, ramOverride.id));
    await t.db
      .update(supplierListings)
      .set({ priceSource: "SUPPLIER", salePriceCents: 99_900, manualOverrides: { salePriceCents: 12_300 } })
      .where(eq(supplierListings.id, priceOverride.id));
    await t.db.update(supplierListings).set({ rawData: { serial: "SN-SECRET-123" }, supplierPriceCents: 11_111 }).where(eq(supplierListings.id, priceOverride.id));

    const { mapCatalogRows } = await import("./db-catalog-mapper");
    const [models, listings, images, unitImages] = await Promise.all([
      t.db.select().from(productModels),
      t.db.select().from(supplierListings).orderBy(asc(supplierListings.sku)),
      t.db.select().from(productImages).orderBy(asc(productImages.productModelId), asc(productImages.position)),
      t.db.select().from(listingImages),
    ]);
    all = mapCatalogRows(models, listings, images, unitImages).items;
  }, 120_000);

  afterAll(async () => {
    await t?.cleanup();
  });

  const strip = ({ product, variant }: SearchableItem) => ({ product, variant });

  it("filtrid, tahud, sorteerimine ja leheküljed = varasem mälus filtreerimine", async () => {
    const { queryCatalogPage } = await import("./catalog-queries");
    const base = computeFacets(all, parseCatalogQuery({}));
    const params: RawSearchParams[] = [{}, { ram: "64" }, { min: "100", max: "200" }, { q: "thinkpad 16gb" }, { page: "2" }, { page: "99" }];
    for (const key of MULTI_FACET_KEYS) for (const option of base.multi[key].slice(0, 3)) params.push({ [key]: option.value });
    for (const sort of SORT_OPTIONS) params.push({ sort: sort.key });

    for (const raw of params) {
      const query = parseCatalogQuery(raw);
      const matching = sortItems(filterItems(all, query), query.sort);
      const pageCount = Math.max(1, Math.ceil(matching.length / PAGE_SIZE));
      const page = Math.min(query.page, pageCount);
      const result = await queryCatalogPage(t.db, query);
      expect({ raw, total: result.total, page: result.page, ids: result.items.map((i) => i.variant.id) }).toEqual({
        raw,
        total: matching.length,
        page,
        ids: matching.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE).map((i) => i.variant.id),
      });
      expect(result.facets).toEqual(computeFacets(all, query));
      expect(result.items).toEqual(matching.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE).map(strip));
    }
  });

  it("tagastab korraga kuni PAGE_SIZE kaarti (LIMIT), kogusumma tuleb SQL-ist", async () => {
    const { queryCatalogPage } = await import("./catalog-queries");
    const result = await queryCatalogPage(t.db, parseCatalogQuery({}));
    expect(result.total).toBe(all.length);
    expect(result.items.length).toBe(Math.min(PAGE_SIZE, all.length));
  });

  it("admini parandused (RAM, müügihind) kehtivad SQL-i filtris; arhiveeritud ja laost otsas pakkumist pole", async () => {
    const { queryCatalogPage } = await import("./catalog-queries");
    const ram64 = await queryCatalogPage(t.db, parseCatalogQuery({ ram: "64" }));
    expect(ram64.items.map((i) => i.variant.sku)).toContain(skus.ramOverride);
    const cheap = await queryCatalogPage(t.db, parseCatalogQuery({ max: "124" }));
    expect(cheap.items.some((i) => i.variant.price.saleCents === 12_300)).toBe(true);
    const everything = await queryCatalogPage(t.db, parseCatalogQuery({ sort: "price-asc", page: "1" }));
    const shownSkus = new Set(all.map((i) => i.variant.sku));
    expect(shownSkus.has(skus.archived)).toBe(false);
    expect(shownSkus.has(skus.outOfStock)).toBe(false);
    expect(everything.total).toBe(all.length);
  });

  it("laoseis: Laptopid teadmata kogus jääb teadmata (mitte 1 tk), Tech täpne kogus säilib", async () => {
    const { queryItemsByVariantIds } = await import("./catalog-queries");
    const ids = all.filter((i) => [skus.unknownQty, skus.exactQty].includes(i.variant.sku)).map((i) => i.variant.id);
    const items = await queryItemsByVariantIds(t.db, ids);
    expect(items.map((i) => i.variant.id)).toEqual(ids);
    const bySku = new Map(items.map((i) => [i.variant.sku, i.variant.stock]));
    expect(bySku.get(skus.unknownQty)).toEqual({ available: true, quantity: null });
    expect(bySku.get(skus.exactQty)).toEqual({ available: true, quantity: 4 });
  });

  it("tooteleht loeb ainult oma mudeli: sama tulemus kui täiskataloogist, puuduv slug → null", async () => {
    const { queryProductDetail } = await import("./catalog-queries");
    const slug = all[0].product.slug;
    const expected = sortItems(all.filter((i) => i.product.slug === slug), "price-asc");
    const detail = await queryProductDetail(t.db, slug);
    expect(detail?.product).toEqual(expected[0].product);
    expect(detail?.variants).toEqual(expected.map((i) => i.variant));
    expect(await queryProductDetail(t.db, "seda-mudelit-pole")).toBeNull();
  });

  it("kaardi andmed ei sisalda toorandmeid, seerianumbreid ega ostuhinda", async () => {
    const { queryCatalogPage } = await import("./catalog-queries");
    const result = await queryCatalogPage(t.db, parseCatalogQuery({ sort: "price-asc" }));
    const json = JSON.stringify(result);
    expect(json).not.toContain("SN-SECRET-123");
    expect(json).not.toContain("rawData");
    expect(json).not.toContain("supplierPriceCents");
    expect(json).not.toContain("searchText");
  });
});

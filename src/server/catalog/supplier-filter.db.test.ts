import { asc, eq, inArray } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { createTestDatabase, hasTestDatabase, type TestDatabase } from "@/test/test-db";
import { computeFacets, filterItems, sortItems, type SearchableItem } from "@/domain/catalog/filtering";
import { buildCatalogHref, parseCatalogQuery, serializeCatalogQuery, type RawSearchParams } from "@/domain/catalog/query";
import { CONFIGURATION_PARAM, productHref } from "@/domain/catalog/urls";
import { productModels, supplierListings } from "@/server/db/schema";

/**
 * Kataloogi "Tarnija" ja "Tarne" filter (SQL facet, pakkumise tasemel) päris PostgreSQL-is, ajutises skeemis.
 * Seed'i pakkumised jagatakse kolme tarnija vahel; osa Foxway pakkumisi on mitteaktiivsed / kinni peetud / otsas.
 */

vi.mock("server-only", () => ({}));
vi.mock("@/server/logging/system-log", () => ({ writeSystemLog: async () => {}, newErrorId: () => "TESTID", errorMessage: (e: unknown) => String(e) }));

describe.skipIf(!hasTestDatabase)("Tarnija filter (SQL facet)", () => {
  let t: TestDatabase;
  let all: SearchableItem[];
  /** Müüdavad pakkumised tarnija kaupa (ootus) */
  const sellable: Record<string, string[]> = { laptopid: [], tech: [], foxway: [] };

  beforeAll(async () => {
    t = await createTestDatabase();
    const { seedCatalog } = await import("@/server/db/seed/seed-catalog");
    const { loadSeedSources } = await import("@/server/db/seed/seed-sources");
    await seedCatalog(t.db, (await loadSeedSources()).sources);

    const rows = await t.db.select().from(supplierListings).where(eq(supplierListings.status, "ACTIVE")).orderBy(asc(supplierListings.sku));
    expect(rows.length).toBeGreaterThanOrEqual(16);
    const set = (ids: string[], values: Partial<typeof supplierListings.$inferInsert>) =>
      t.db.update(supplierListings).set(values).where(inArray(supplierListings.id, ids));
    const byKind = (index: number) => (index % 3 === 0 ? "laptopid" : index % 3 === 1 ? "tech" : "foxway");

    // Laptopid.ee: salongis (kogus teadmata, tarneaega pole); Tech: täpne kogus, 1–2 päeva; Foxway: täpne kogus, 2–4 päeva
    const groups: Record<string, string[]> = { laptopid: [], tech: [], foxway: [] };
    rows.forEach((row, index) => groups[byKind(index)].push(row.id));
    await set(groups.laptopid, { supplier: "laptopid", stock: null, available: true, deliveryMinDays: null, deliveryMaxDays: null, qualityHold: null });
    await set(groups.tech, { supplier: "tech", stock: 3, available: true, deliveryMinDays: 1, deliveryMaxDays: 2, qualityHold: null });
    // Foxway sync blokeerib C klassi (foxway-normalizer.ts) — müüdavatel Foxway pakkumistel C-d pole
    await set(groups.foxway, { supplier: "foxway", stock: 2, available: true, deliveryMinDays: 2, deliveryMaxDays: 4, qualityHold: null, grade: "B" });

    // Foxway pakkumised, mis EI ole müüdavad (ei tohi jõuda tulemustesse ega loenduritesse)
    const [inactive, cGrade, review, unavailable, ...restFoxway] = groups.foxway;
    await set([inactive], { status: "ARCHIVED" });
    await set([cGrade], { grade: "C", qualityHold: "BLOCKED", qualityHoldReason: "Foxway C klassi ei müüda" });
    await set([review], { qualityHold: "REVIEW" });
    await set([unavailable], { available: false, stock: 0 });
    // Tech: üks pakkumine otsas (laoseis 0)
    const [techOut, ...restTech] = groups.tech;
    await set([techOut], { stock: 0 });

    sellable.laptopid = groups.laptopid;
    sellable.tech = restTech;
    sellable.foxway = restFoxway;

    const { mapCatalogRows } = await import("./db-catalog-mapper");
    const [models, listings] = await Promise.all([
      t.db.select().from(productModels),
      t.db.select().from(supplierListings).orderBy(asc(supplierListings.sku)),
    ]);
    all = mapCatalogRows(models, listings, [], []).items;
  }, 120_000);

  afterAll(async () => {
    await t?.cleanup();
  });

  const page = async (raw: RawSearchParams) => {
    const { queryCatalogPage } = await import("./catalog-queries");
    return queryCatalogPage(t.db, parseCatalogQuery({ ...raw, sort: "price-asc" }));
  };
  const listingIdsOf = async (supplier: string) =>
    (await t.db.select({ id: supplierListings.id, supplier: supplierListings.supplier }).from(supplierListings).where(eq(supplierListings.supplier, supplier))).map((r) => r.id);
  const count = (facets: Awaited<ReturnType<typeof page>>["facets"], key: "supplier" | "delivery", value: string) =>
    facets.multi[key].find((o) => o.value === value)?.count ?? 0;

  it("1. ilma tarnija filtrita → kõik müüdavad pakkumised kõigilt tarnijatelt", async () => {
    const result = await page({});
    const expected = sellable.laptopid.length + sellable.tech.length + sellable.foxway.length;
    expect(result.total).toBe(expected);
    expect(new Set(all.map((i) => i.variant.supplier))).toEqual(new Set(["laptopid", "tech", "foxway"]));
  });

  it("2–4. üks tarnija → ainult selle tarnija pakkumised (kliendi nimed, mitte sisemine kood)", async () => {
    for (const supplier of ["laptopid", "tech", "foxway"] as const) {
      const result = await page({ supplier });
      expect(result.total).toBe(sellable[supplier].length);
      expect(result.items.every((item) => item.variant.supplier === supplier)).toBe(true);
    }
    const labels = (await page({})).facets.multi.supplier.map((o) => o.label);
    expect(labels).toEqual(["Laptopid.ee", "Techvision", "Foxway"]);
    expect(labels).not.toContain("TECH");
  });

  it("5. multi-select Laptopid.ee + Techvision → mõlemad, Foxway mitte", async () => {
    const result = await page({ supplier: "laptopid,tech" });
    expect(result.total).toBe(sellable.laptopid.length + sellable.tech.length);
    expect(new Set(result.items.map((i) => i.variant.supplier))).toEqual(new Set(["laptopid", "tech"]));
  });

  it("6–8. loendur loeb ainult müüdavaid: mitteaktiivne, otsas, Foxway C (BLOCKED) ja REVIEW ei lähe arvesse", async () => {
    const { facets } = await page({});
    expect(count(facets, "supplier", "laptopid")).toBe(sellable.laptopid.length);
    expect(count(facets, "supplier", "tech")).toBe(sellable.tech.length);
    expect(count(facets, "supplier", "foxway")).toBe(sellable.foxway.length);
    // Andmebaasis on Foxway pakkumisi rohkem kui loendur näitab (4 ei ole müüdavad)
    expect((await listingIdsOf("foxway")).length).toBe(sellable.foxway.length + 4);
    expect(all.some((i) => i.variant.supplier === "foxway" && i.variant.grade === "C")).toBe(false);
  });

  it("loendurid = sama reegel mis mälus filtreerimine (computeFacets), ka valitud tarnijaga", async () => {
    for (const raw of [{}, { supplier: "foxway" }, { supplier: "tech", delivery: "1-2" }, { delivery: "kohapeal" }]) {
      const query = parseCatalogQuery(raw);
      const memory = computeFacets(all, query);
      const sql = (await page(raw)).facets;
      for (const key of ["supplier", "delivery"] as const) {
        expect({ raw, key, options: sql.multi[key] }).toEqual({ raw, key, options: memory.multi[key] });
      }
    }
  });

  it("9. tarnija + tarne töötavad koos (JA eri filtrite vahel)", async () => {
    expect((await page({ supplier: "laptopid", delivery: "kohapeal" })).total).toBe(sellable.laptopid.length);
    expect((await page({ supplier: "foxway", delivery: "kohapeal" })).total).toBe(0);
    expect((await page({ supplier: "laptopid,foxway", delivery: "2-4" })).total).toBe(sellable.foxway.length);
    // Tarne loendur arvestab valitud tarnijat
    const { facets } = await page({ supplier: "tech" });
    expect(facets.multi.delivery.filter((o) => o.count > 0).map((o) => o.label)).toEqual(["Tarne 1–2 päeva"]);
    expect((await page({})).facets.multi.delivery.map((o) => o.label)).toEqual(["Poes kohapeal", "Tarne 1–2 päeva", "Tarne 2–4 päeva"]);
  });

  it("10–11. tarnija + tootja ja tarnija + hind töötavad koos", async () => {
    for (const raw of [{ supplier: "foxway", brand: "lenovo" }, { supplier: "tech", min: "300", max: "700" }, { supplier: "laptopid,foxway", brand: "dell", max: "600" }]) {
      const query = parseCatalogQuery({ ...raw, sort: "price-asc" });
      const expected = sortItems(filterItems(all, query), query.sort);
      const result = await page(raw);
      expect({ raw, total: result.total }).toEqual({ raw, total: expected.length });
      expect(result.items.map((i) => i.variant.id)).toEqual(expected.slice(0, result.items.length).map((i) => i.variant.id));
    }
    const lenovoFoxway = await page({ supplier: "foxway", brand: "lenovo" });
    expect(lenovoFoxway.items.every((i) => i.variant.supplier === "foxway" && i.product.brand === "lenovo")).toBe(true);
  });

  it("12. URL olek: tarnija ja tarne säilivad (stabiilne järjekord), vigased väärtused visatakse välja", () => {
    const query = parseCatalogQuery({ supplier: "foxway,laptopid,TECH,mock", delivery: "2-4,kohapeal,x" });
    expect(query.facets.supplier).toEqual(["foxway", "laptopid", "tech"]);
    expect(query.facets.delivery).toEqual(["2-4", "kohapeal"]);
    const search = serializeCatalogQuery(query);
    expect(search).toBe("delivery=kohapeal,2-4&supplier=laptopid,tech,foxway");
    // Link → päring → link on sama (jagatav URL, tagasi/edasi taastab sama valiku)
    expect(serializeCatalogQuery(parseCatalogQuery(Object.fromEntries(new URLSearchParams(search))))).toBe(search);
    expect(buildCatalogHref("/sulearvutid", parseCatalogQuery({ supplier: "tech" }))).toBe("/sulearvutid?supplier=tech");
  });

  it("14. filtreeritud kaardi link valib sama tarnija konfiguratsiooni (mitte mudeli teise tarnija vaikevalikut)", async () => {
    const result = await page({ supplier: "foxway" });
    expect(result.items.length).toBeGreaterThan(0);
    for (const item of result.items) {
      const href = productHref(item);
      const selected = new URL(href, "https://x").searchParams.get(CONFIGURATION_PARAM);
      expect(selected).toBe(item.variant.id);
      expect(all.find((i) => i.variant.id === selected)?.variant.supplier).toBe("foxway");
    }
  });
});

import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { createTestDatabase, hasTestDatabase, type TestDatabase } from "@/test/test-db";
import { seriesFilterValue } from "@/domain/catalog/facets";
import { emptyQuery } from "@/domain/catalog/query";
import { HOME_RECENT_GRADES, HOME_RECENT_MIN_GEN_RANK, homeRecentQuery } from "@/domain/storefront/home-recent";
import { businessSeriesValues } from "@/domain/catalog/business-series";
import { supplierListings } from "@/server/db/schema";

/** Avalehe "Viimati lisatud" ärireegel SQL-is (ajutine skeem). Kataloogist ei eemaldata midagi. */

vi.mock("server-only", () => ({}));
vi.mock("@/server/logging/system-log", () => ({ writeSystemLog: async () => {}, newErrorId: () => "TESTID", errorMessage: (e: unknown) => String(e) }));

describe.skipIf(!hasTestDatabase)("avalehe Viimati lisatud", () => {
  let t: TestDatabase;

  beforeAll(async () => {
    t = await createTestDatabase();
    const { seedCatalog } = await import("@/server/db/seed/seed-catalog");
    const { loadSeedSources } = await import("@/server/db/seed/seed-sources");
    await seedCatalog(t.db, (await loadSeedSources()).sources);
  }, 120_000);

  afterAll(async () => {
    await t?.cleanup();
  });

  const homeRecent = async () => {
    const { queryTopItems } = await import("./catalog-queries");
    return queryTopItems(t.db, homeRecentQuery(), 50, { onePerModel: true, minGenRank: HOME_RECENT_MIN_GEN_RANK });
  };
  const catalogCount = async () => (await (await import("./catalog-queries")).queryCatalogPage(t.db, emptyQuery())).total;

  it("ainult seisukord ≥ B ja äriklassi seeria, üks mudeli kohta", async () => {
    const items = await homeRecent();
    expect(items.length).toBeGreaterThan(0);
    for (const item of items) {
      expect(HOME_RECENT_GRADES).toContain(item.variant.grade);
      expect(businessSeriesValues()).toContain(seriesFilterValue(item.product));
    }
    expect(new Set(items.map((i) => i.product.slug)).size).toBe(items.length);
  });

  it("C-klass ja vana protsessor jäävad avalehelt välja, aga kataloogi alles", async () => {
    const [first] = await homeRecent();
    const [row] = await t.db.select().from(supplierListings).where(eq(supplierListings.sku, first.variant.sku));
    const before = await catalogCount();
    const newest = new Date(Date.now() + 86_400_000);

    await t.db.update(supplierListings).set({ firstSeenAt: newest, manualOverrides: { grade: "C" } }).where(eq(supplierListings.id, row.id));
    expect((await homeRecent()).some((i) => i.variant.sku === row.sku)).toBe(false);
    expect(await catalogCount()).toBe(before);

    await t.db.update(supplierListings).set({ manualOverrides: { cpuGeneration: "intel-6" } }).where(eq(supplierListings.id, row.id));
    expect((await homeRecent()).some((i) => i.variant.sku === row.sku)).toBe(false);
    expect(await catalogCount()).toBe(before);

    await t.db.update(supplierListings).set({ manualOverrides: {} }).where(eq(supplierListings.id, row.id));
    expect((await homeRecent())[0].variant.sku).toBe(row.sku);
  });
});

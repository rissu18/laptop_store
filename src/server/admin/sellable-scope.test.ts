import { eq, inArray } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createTestDatabase, hasTestDatabase, type TestDatabase } from "@/test/test-db";
import { performanceIssuesOf, keyboardReportedMissing } from "@/domain/admin/data-quality-rules";
import { productModels, supplierListings } from "@/server/db/schema";

/**
 * Admini skoop "Müügis" (sellable.ts) = poe nähtavus (storefrontVisibility) päris andmebaasis. Ajutine skeem,
 * poe andmeid ei puudutata.
 */

const state = vi.hoisted(() => ({ db: null as unknown }));

vi.mock("next/cache", () => ({ updateTag: () => {}, cacheTag: () => {}, cacheLife: () => {} }));
vi.mock("@/server/db/client", async (importOriginal) => ({ ...(await importOriginal<object>()), getDb: () => state.db, isDatabaseConfigured: () => true }));
vi.mock("@/server/logging/system-log", () => ({ writeSystemLog: async () => {}, newErrorId: () => "TESTID", errorMessage: (e: unknown) => String(e) }));
vi.mock("@/server/auth/auth", () => ({ UnauthorizedError: class extends Error {}, requireAdmin: async () => ({ id: "a", email: "a@example.com" }), requireAdminAction: async () => ({ id: "a", email: "a@example.com" }) }));

describe.skipIf(!hasTestDatabase)("admin: skoop Müügis = poe nähtavus", () => {
  let t: TestDatabase;
  let listings: (typeof supplierListings.$inferSelect)[];
  let originals: Map<string, typeof supplierListings.$inferSelect>;

  const snapshot = async () => (await import("./sellable")).loadSellableSnapshot(t.db);
  const counts = async (scope: "sellable" | "all") => (await import("./data-quality/queries")).getDataQualityCounts(scope);

  beforeAll(async () => {
    t = await createTestDatabase();
    state.db = t.db;
    const { seedCatalog } = await import("@/server/db/seed/seed-catalog");
    const { loadSeedSources } = await import("@/server/db/seed/seed-sources");
    await seedCatalog(t.db, (await loadSeedSources()).sources);
    listings = await t.db.select().from(supplierListings).orderBy(supplierListings.sku);
    originals = new Map(listings.map((l) => [l.id, l]));
  }, 120_000);

  afterAll(async () => {
    await t?.cleanup();
  });

  // Iga test alustab seemne algseisust
  beforeEach(async () => {
    for (const row of originals.values()) {
      await t.db
        .update(supplierListings)
        .set({ status: row.status, stock: row.stock, available: row.available, qualityHold: row.qualityHold, qualityHoldReason: row.qualityHoldReason, grade: row.grade, manualOverrides: row.manualOverrides })
        .where(eq(supplierListings.id, row.id));
    }
    await t.db.update(productModels).set({ status: "ACTIVE" });
  });

  it("vaikimisi skoop on Müügis; Kõik sisaldab ka mitteaktiivseid/arhiveeritud", async () => {
    const before = await snapshot();
    expect(before.listingIds.length).toBeGreaterThan(3);
    const [hidden, archived] = before.listingIds;
    await t.db.update(supplierListings).set({ status: "HIDDEN" }).where(eq(supplierListings.id, hidden));
    await t.db.update(supplierListings).set({ status: "ARCHIVED" }).where(eq(supplierListings.id, archived));

    const after = await snapshot();
    expect(after.listingIds).not.toContain(hidden);
    expect(after.listingIds).not.toContain(archived);
    expect(after.listingIds.length).toBe(before.listingIds.length - 2);

    const sellable = await counts("sellable");
    const all = await counts("all");
    expect(sellable.scope).toBe("sellable");
    expect(sellable.listingTotal).toBe(after.listingIds.length);
    expect(all.listingTotal).toBe(listings.length);
    expect(all.listingTotal).toBeGreaterThan(sellable.listingTotal);
  });

  it("Foxway Grade C (BLOCKED) ja REVIEW ei lähe Müügis loendisse", async () => {
    const [c, review] = (await snapshot()).listingIds;
    await t.db.update(supplierListings).set({ supplier: "foxway", grade: "C", qualityHold: "BLOCKED", qualityHoldReason: 'Seisukord "Grade C" — Foxway C klassi ei müüda' }).where(eq(supplierListings.id, c));
    await t.db.update(supplierListings).set({ qualityHold: "REVIEW", qualityHoldReason: "Tundmatu rike" }).where(eq(supplierListings.id, review));
    const after = await snapshot();
    expect(after.listingIds).not.toContain(c);
    expect(after.listingIds).not.toContain(review);
    // Andmekvaliteedi "Kõik" loeb neid endiselt
    expect((await counts("all")).listingTotal).toBe(listings.length);
    await t.db.update(supplierListings).set({ supplier: originals.get(c)!.supplier }).where(eq(supplierListings.id, c));
  });

  it("laoseis 0 / tarnija nimekirjast kadunud ei lähe Müügis loendisse", async () => {
    const [zero, gone] = (await snapshot()).listingIds;
    await t.db.update(supplierListings).set({ stock: 0 }).where(eq(supplierListings.id, zero));
    await t.db.update(supplierListings).set({ available: false }).where(eq(supplierListings.id, gone));
    const after = await snapshot();
    expect(after.listingIds).not.toContain(zero);
    expect(after.listingIds).not.toContain(gone);
  });

  it("mitteaktiivse mudeli pakkumised ja mudel ei lähe Müügis loendisse", async () => {
    const before = await snapshot();
    const [first] = await t.db.select().from(supplierListings).where(inArray(supplierListings.id, before.listingIds)).limit(1);
    await t.db.update(productModels).set({ status: "HIDDEN" }).where(eq(productModels.id, first.productModelId));
    const after = await snapshot();
    expect(after.modelIds).not.toContain(first.productModelId);
    const ofModel = listings.filter((l) => l.productModelId === first.productModelId).map((l) => l.id);
    expect(after.listingIds.filter((id) => ofModel.includes(id))).toEqual([]);
    expect((await counts("sellable")).modelTotal).toBe(after.modelIds.length);
  });

  it("drill-down nimekiri (scope=sellable) = Müügis loendur", async () => {
    const { listListings } = await import("./products/queries");
    const sellable = await counts("sellable");
    const unknownKeyboard = sellable.listings.find((i) => i.key === "unknown-keyboard")!.count;
    const list = await listListings({ issue: "unknown-keyboard", scope: "sellable", page: 1 });
    expect(list.total).toBe(unknownKeyboard);
    expect(list.rows.every((row) => row.visibility.visible)).toBe(true);
  });

  it("kiirusindeksi ja 'Missing Keyboard' SQL = domeeni reegel (JS)", async () => {
    const [a, b, c] = listings;
    await t.db.update(supplierListings).set({ details: { cpuBenchmark3dmark06: 6235, gpuBenchmark3dmark11: 0, cpuMaxMhz: 4400 } }).where(eq(supplierListings.id, a.id));
    await t.db.update(supplierListings).set({ enrichment: { cpuBenchmark: { value: 5000, source: "LAPTOPID", matchedBy: "cpu", confidence: 1, at: "2026-10-14T00:00:00Z" } }, manualOverrides: {} }).where(eq(supplierListings.id, b.id));
    await t.db.update(supplierListings).set({ keyboard: null, rawData: { foxway: { keyboard: "Missing Keyboard" } } }).where(eq(supplierListings.id, c.id));

    const rows = await t.db.select().from(supplierListings);
    const all = await counts("all");
    const sqlCount = (key: string) => all.listings.find((i) => i.key === key)!.count;
    for (const key of ["missing-cpu-benchmark", "missing-gpu-benchmark", "missing-cpu-max-mhz"] as const) {
      expect(sqlCount(key)).toBe(rows.filter((row) => performanceIssuesOf(row).includes(key)).length);
    }
    // Varem kaotas drizzle'i sql`` mall regulaaravaldise kaldkriipsud ja "Missing Keyboard" ei leitud kunagi
    expect(sqlCount("missing-keyboard")).toBe(rows.filter((row) => !(row.manualOverrides as Record<string, unknown>).keyboard && !row.keyboard && keyboardReportedMissing(row)).length);
    expect(sqlCount("missing-keyboard")).toBeGreaterThanOrEqual(1);

    for (const row of [a, b, c]) await t.db.update(supplierListings).set({ details: row.details, enrichment: row.enrichment, keyboard: row.keyboard, rawData: row.rawData }).where(eq(supplierListings.id, row.id));
  });
});

import { and, desc, eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { createTestDatabase, hasTestDatabase, type TestDatabase } from "@/test/test-db";
import { icecatProduct } from "@/integrations/icecat/icecat-fixtures";
import { matchModel } from "@/integrations/icecat/icecat-matcher";
import { adminUsers, auditLogs, icecatMetadata, productIdentifiers, productImages, productModels, supplierListings } from "@/server/db/schema";

/**
 * Admin Sprint 2: Icecati ülevaatus (kinnita / lükka tagasi / taasta / käsitsi ID), kiirparandused ja audit.
 * Ajutine skeem — poe andmeid ei puudutata.
 */

const state = vi.hoisted(() => ({ db: null as unknown, admin: null as null | { id: string; email: string; name: string; role: string; sessionId: string } }));

vi.mock("next/cache", () => ({ updateTag: () => {}, cacheTag: () => {}, cacheLife: () => {}, refresh: () => {} }));
vi.mock("@/server/db/client", async (importOriginal) => ({ ...(await importOriginal<object>()), getDb: () => state.db, isDatabaseConfigured: () => true }));
vi.mock("@/server/logging/system-log", () => ({ writeSystemLog: async () => {}, newErrorId: () => "TESTID", errorMessage: (e: unknown) => String(e) }));
vi.mock("@/server/auth/auth", () => {
  class UnauthorizedError extends Error {}
  return { UnauthorizedError, requireAdmin: async () => state.admin, requireAdminAction: async () => state.admin };
});

describe.skipIf(!hasTestDatabase)("admin Sprint 2", () => {
  let t: TestDatabase;
  let model: typeof productModels.$inferSelect;
  let other: typeof productModels.$inferSelect;
  let listing: typeof supplierListings.$inferSelect;

  const lastAudit = async (action: string) => (await t.db.select().from(auditLogs).where(eq(auditLogs.action, action)).orderBy(desc(auditLogs.createdAt)).limit(1))[0];
  const meta = async (id: string) => (await t.db.select().from(icecatMetadata).where(eq(icecatMetadata.productModelId, id)))[0];
  const identifiers = async (id: string, kind: "CONFIRMED_ICECAT_ID" | "REJECTED_ICECAT_ID") =>
    (await t.db.select().from(productIdentifiers).where(and(eq(productIdentifiers.productModelId, id), eq(productIdentifiers.kind, kind)))).map((r) => r.value);

  beforeAll(async () => {
    t = await createTestDatabase();
    state.db = t.db;
    const { seedCatalog } = await import("@/server/db/seed/seed-catalog");
    const { loadSeedSources } = await import("@/server/db/seed/seed-sources");
    await seedCatalog(t.db, (await loadSeedSources()).sources);
    const [user] = await t.db.insert(adminUsers).values({ email: "admin@example.com", name: "Admin", passwordHash: "scrypt$x" }).returning();
    state.admin = { id: user.id, email: user.email, name: user.name, role: user.role, sessionId: "s" };
    const { loadSellableSnapshot } = await import("./sellable");
    const snapshot = await loadSellableSnapshot(t.db);
    const models = await t.db.select().from(productModels);
    model = models.find((m) => snapshot.modelIds.includes(m.id))!;
    other = models.find((m) => m.id !== model.id && snapshot.modelIds.includes(m.id))!;
    [listing] = await t.db.select().from(supplierListings).where(eq(supplierListings.productModelId, model.id)).limit(1);
    // Kaks ülevaatusel mudelit: üks müügis, teine müügist väljas (peidetud)
    const values = { status: "NEEDS_REVIEW" as const, reason: "TITLE_MISMATCH", icecatId: "5001", icecatTitle: "Kandidaat", matchType: "NAME", confidence: 0.7, matchedBy: "name", imageCount: 0, checkedAt: new Date() };
    await t.db.delete(icecatMetadata);
    await t.db.insert(icecatMetadata).values([{ productModelId: model.id, ...values }, { productModelId: other.id, ...values, icecatId: "6001" }]);
    await t.db.update(productModels).set({ status: "HIDDEN" }).where(eq(productModels.id, other.id));
  }, 120_000);

  afterAll(async () => {
    await t?.cleanup();
  });

  describe("Icecati ülevaatuse järjekord", () => {
    it("vaikimisi ainult müügis mudelid; Kõik sisaldab müügist väljas mudelit", async () => {
      const { getIcecatReviewQueue } = await import("./images/review-queue");
      const sellable = await getIcecatReviewQueue({ state: "REVIEW", scope: "sellable", page: 1 });
      expect(sellable.rows.map((r) => r.modelId)).toEqual([model.id]);
      expect(sellable.rows[0]).toMatchObject({ sellable: true, state: "REVIEW", icecat: { icecatId: "5001" } });
      const all = await getIcecatReviewQueue({ state: "REVIEW", scope: "all", page: 1 });
      expect(all.rows.map((r) => r.modelId)).toEqual([model.id, other.id]); // müügis enne
      expect(all.counts.REVIEW).toEqual({ sellable: 1, all: 2 });
    });
  });

  describe("Icecati otsused", () => {
    it("lükka tagasi → REJECTED, ID salvestatud, audit; sama kandidaati enam ei pakuta", async () => {
      const { rejectIcecatCandidateAction } = await import("./images/actions");
      const result = await rejectIcecatCandidateAction(model.id, "5001");
      expect(result.ok).toBe(true);
      expect(await identifiers(model.id, "REJECTED_ICECAT_ID")).toEqual(["5001"]);
      expect(await meta(model.id)).toMatchObject({ status: "REJECTED", icecatId: "5001" });
      expect((await lastAudit("icecat.reject"))?.changes).toMatchObject({ rejectedIcecatId: { from: null, to: "5001" }, icecatStatus: { from: "NEEDS_REVIEW", to: "REJECTED" } });

      // Matcher (sama, mida enrich:catalog / "Otsi uuesti" kasutab) jätab tagasilükatud ID vahele
      const { loadModelIdentifiers } = await import("@/server/images/db-image-repository");
      const ids = await loadModelIdentifiers(t.db, model.id);
      const client = { getProduct: async () => ({ status: "FOUND" as const, product: icecatProduct({ icecatId: "5001" }) }) };
      const outcome = await matchModel({ id: model.slug, brandName: "Dell", modelName: "Latitude 5420" }, { ...ids, icecatIds: ["5001"] }, client);
      expect("product" in outcome && outcome.product.GeneralInfo.IcecatId === "5001").toBe(false);
      expect(outcome.attempts.some((a) => a.result === "REJECTED_BY_ADMIN")).toBe(true);
    });

    it("taasta kandidaat → tagasi ülevaatusele (üks klikk), audit", async () => {
      const { restoreIcecatCandidateAction } = await import("./images/actions");
      expect((await restoreIcecatCandidateAction(model.id, "5001")).ok).toBe(true);
      expect(await identifiers(model.id, "REJECTED_ICECAT_ID")).toEqual([]);
      expect((await meta(model.id))?.status).toBe("NEEDS_REVIEW");
      expect(await lastAudit("icecat.reject_undone")).toBeTruthy();
    });

    it("kinnita → MATCHED, aga 0 kohalikku pilti eristub (pildid alla laadimata); ei teeskle importi", async () => {
      // Nagu productionis: Icecati faile pole alla laaditud (seemnes on) → peidame need ajutises skeemis
      await t.db.update(productImages).set({ isHidden: true }).where(and(eq(productImages.productModelId, model.id), eq(productImages.source, "ICECAT")));
      const { confirmIcecatMatchAction } = await import("./images/actions");
      const result = await confirmIcecatMatchAction(model.id, "5001", "Kandidaat");
      expect(result.ok && result.message).toContain("pildid pole veel alla laaditud");
      expect(await identifiers(model.id, "CONFIRMED_ICECAT_ID")).toEqual(["5001"]);
      const { getIcecatReviewQueue } = await import("./images/review-queue");
      const queue = await getIcecatReviewQueue({ state: "MATCHED_NO_IMAGES", scope: "sellable", page: 1 });
      expect(queue.rows.find((r) => r.modelId === model.id)?.state).toBe("MATCHED_NO_IMAGES");
      expect((await lastAudit("icecat.manual_match"))?.changes).toMatchObject({ icecatStatus: { to: "MATCHED" } });
    });

    it("käsitsi Icecat ID: tagasilükatud ID-d saab teadlikult kinnitada (tagasilükkamine eemaldatakse)", async () => {
      const { confirmIcecatMatchAction, rejectIcecatCandidateAction } = await import("./images/actions");
      await rejectIcecatCandidateAction(model.id, "7777");
      expect(await identifiers(model.id, "REJECTED_ICECAT_ID")).toContain("7777");
      expect((await confirmIcecatMatchAction(model.id, "7777", "Käsitsi")).ok).toBe(true);
      expect(await identifiers(model.id, "CONFIRMED_ICECAT_ID")).toEqual(["7777"]);
      expect(await identifiers(model.id, "REJECTED_ICECAT_ID")).not.toContain("7777");
    });

    it("vigane ID lükatakse tagasi", async () => {
      const { rejectIcecatCandidateAction } = await import("./images/actions");
      expect((await rejectIcecatCandidateAction(model.id, "abc")).ok).toBe(false);
    });
  });

  describe("kiirparandused", () => {
    it("klaviatuur registrist → parandus (tarnija väärtus jääb), audit; tundmatu kood keelatud", async () => {
      const { setListingOverrideAction } = await import("./products/actions");
      expect((await setListingOverrideAction(listing.id, "keyboard", "XYZ")).ok).toBe(false);
      expect((await setListingOverrideAction(listing.id, "keyboard", "EST")).ok).toBe(true);
      const [row] = await t.db.select().from(supplierListings).where(eq(supplierListings.id, listing.id));
      expect((row.manualOverrides as Record<string, unknown>).keyboard).toBe("EST");
      expect(row.keyboard).toBe(listing.keyboard);
      expect((await lastAudit("listing.update"))?.changes).toMatchObject({ keyboard: { from: listing.keyboard, to: "EST" } });
    });

    it("jõudlus: valideerimine, parandus, taastamine (audit vana → uus)", async () => {
      const { clearOverrideAction, setListingOverrideAction } = await import("./products/actions");
      expect((await setListingOverrideAction(listing.id, "cpuBenchmark", "0")).ok).toBe(false);
      expect((await setListingOverrideAction(listing.id, "gpuBenchmark", "-1")).ok).toBe(false);
      expect((await setListingOverrideAction(listing.id, "cpuMaxMhz", "90000")).ok).toBe(false);
      expect((await setListingOverrideAction(listing.id, "cpuMaxMhz", "4900")).ok).toBe(true);
      expect((await setListingOverrideAction(listing.id, "cpuBenchmark", "6 235")).ok).toBe(true);
      const [row] = await t.db.select().from(supplierListings).where(eq(supplierListings.id, listing.id));
      expect(row.manualOverrides).toMatchObject({ cpuMaxMhz: 4900, cpuBenchmark: 6235, keyboard: "EST" });
      expect((await lastAudit("listing.update"))?.changes).toMatchObject({ cpuBenchmark: { to: 6235 } });

      // Andmekvaliteedi SQL arvestab parandust (sama reegel mis JS)
      const { getDataQualityCounts } = await import("./data-quality/queries");
      const { listListings } = await import("./products/queries");
      const missing = await listListings({ issue: "missing-cpu-benchmark", page: 1 });
      expect(missing.rows.some((r) => r.raw.id === listing.id)).toBe(false);
      expect((await getDataQualityCounts("all")).listings.find((i) => i.key === "missing-cpu-max-mhz")).toBeTruthy();

      expect((await clearOverrideAction("listing", listing.id, "cpuBenchmark")).ok).toBe(true);
      const [after] = await t.db.select().from(supplierListings).where(eq(supplierListings.id, listing.id));
      expect(after.manualOverrides).not.toHaveProperty("cpuBenchmark");
      expect((await lastAudit("listing.override_cleared"))?.changes).toMatchObject({ cpuBenchmark: { from: 6235 } });
      expect((await clearOverrideAction("listing", listing.id, "keyboard")).ok).toBe(true);
    });
  });
});

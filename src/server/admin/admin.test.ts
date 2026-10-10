import { and, eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createTestDatabase, hasTestDatabase, type TestDatabase } from "@/test/test-db";
import { auditLogs, adminUsers, pricingRules, productImages, productModels, storeSettings, supplierListings } from "@/server/db/schema";

/**
 * ADMIN PRODUCTS, IMAGES, DATA QUALITY, PRICING, SETTINGS, AUDIT, SECURITY.
 * Server action'id jooksevad päris andmebaasi (ajutine skeem) vastu; Next.js-i päringukontekst
 * (küpsised, vahemälu) ja sessioon on asendatud testiversioonidega.
 */

const state = vi.hoisted(() => ({ db: null as unknown, admin: null as null | { id: string; email: string; name: string; role: string; sessionId: string }, updatedTags: [] as string[] }));

vi.mock("next/cache", () => ({ updateTag: (tag: string) => state.updatedTags.push(tag), cacheTag: () => {}, cacheLife: () => {} }));
vi.mock("@/server/db/client", async (importOriginal) => ({ ...(await importOriginal<object>()), getDb: () => state.db, isDatabaseConfigured: () => true }));
vi.mock("@/server/logging/system-log", () => ({ writeSystemLog: async () => {}, newErrorId: () => "TESTID", errorMessage: (e: unknown) => String(e) }));
vi.mock("@/server/auth/auth", () => {
  class UnauthorizedError extends Error {}
  return {
    UnauthorizedError,
    requireAdmin: async () => {
      if (!state.admin) throw new Error("NEXT_REDIRECT");
      return state.admin;
    },
    requireAdminAction: async () => {
      if (!state.admin) throw new UnauthorizedError("Sessioon on aegunud. Logi uuesti sisse.");
      return state.admin;
    },
  };
});

const form = (values: Record<string, string | string[]>) => {
  const data = new FormData();
  for (const [key, value] of Object.entries(values)) for (const v of [value].flat()) data.append(key, v);
  return data;
};

describe.skipIf(!hasTestDatabase)("admin", () => {
  let t: TestDatabase;
  let listing: typeof supplierListings.$inferSelect;
  let model: typeof productModels.$inferSelect;

  /** Konfiguratsiooni vorm praeguste väärtustega (nagu brauser selle saadaks). */
  const listingForm = (l: typeof supplierListings.$inferSelect, changes: Record<string, string> = {}) =>
    form({
      cpu: l.cpu ?? "",
      cpuFamily: l.cpuFamily ?? "",
      cpuGeneration: l.cpuGeneration ?? "",
      ramGb: String(l.ramGb ?? ""),
      ramType: l.ramType ?? "",
      storageGb: String(l.storageGb ?? ""),
      gpu: l.gpu ?? "",
      gpuDedicated: l.gpuDedicated === null ? "" : String(l.gpuDedicated),
      screenSizeIn: String(l.screenSizeIn ?? ""),
      resolution: l.resolution ?? "",
      resolutionLabel: l.resolutionLabel ?? "",
      panel: l.panel ?? "",
      touchscreen: l.touchscreen === null ? "" : String(l.touchscreen),
      keyboard: l.keyboard ?? "",
      grade: l.grade ?? "",
      stock: String(l.stock ?? ""),
      supplierPriceCents: l.supplierPriceCents === null ? "" : String(l.supplierPriceCents / 100),
      operatingSystem: l.operatingSystem ?? "",
      warrantyMonths: String(l.warrantyMonths ?? ""),
      batteryHealthPct: String(l.batteryHealthPct ?? ""),
      chargerIncluded: l.chargerIncluded === null ? "" : String(l.chargerIncluded),
      salePriceCents: l.salePriceCents === null ? "" : String(l.salePriceCents / 100),
      status: l.status,
      ...changes,
    });

  beforeAll(async () => {
    t = await createTestDatabase();
    state.db = t.db;
    const { seedCatalog } = await import("@/server/db/seed/seed-catalog");
    const { loadSeedSources } = await import("@/server/db/seed/seed-sources");
    await seedCatalog(t.db, (await loadSeedSources()).sources);
    const [user] = await t.db.insert(adminUsers).values({ email: "admin@example.com", name: "Admin", passwordHash: "scrypt$x" }).returning();
    state.admin = { id: user.id, email: user.email, name: user.name, role: user.role, sessionId: "s" };
    [listing] = await t.db.select().from(supplierListings).where(eq(supplierListings.sku, "SP-10280"));
    [model] = await t.db.select().from(productModels).where(eq(productModels.id, listing.productModelId));
  }, 120_000);
  afterAll(async () => {
    await t?.cleanup();
  });
  beforeEach(() => {
    state.updatedTags = [];
  });

  describe("tooted", () => {
    it("konfiguratsiooni muudatus salvestub parandusena; tarnija väärtus jääb alles; audit + vahemälu", async () => {
      const { updateListingAction } = await import("./products/actions");
      const result = await updateListingAction(listing.id, null, listingForm(listing, { ramGb: "16", keyboard: "EST", salePriceCents: "249,50" }));
      expect(result).toEqual({ ok: true, message: "Konfiguratsioon salvestatud." });

      const [after] = await t.db.select().from(supplierListings).where(eq(supplierListings.id, listing.id));
      expect(after.ramGb).toBe(listing.ramGb); // tarnija veerg muutmata
      expect(after.manualOverrides).toEqual({ ramGb: 16, keyboard: "EST" });
      expect(after.salePriceCents).toBe(24950);
      expect(state.updatedTags).toContain("catalog");

      const [audit] = await t.db.select().from(auditLogs).where(and(eq(auditLogs.entityId, listing.id), eq(auditLogs.action, "listing.update")));
      expect(audit.adminEmail).toBe("admin@example.com");
      expect(audit.changes).toMatchObject({ ramGb: { from: listing.ramGb, to: 16 }, keyboard: { from: listing.keyboard, to: "EST" }, salePriceCents: { from: listing.salePriceCents, to: 24950 } });
    });

    it("poe kataloog näitab efektiivset (parandatud) väärtust", async () => {
      const { mapCatalogRows } = await import("@/server/catalog/db-catalog-mapper");
      const [models, listings, images] = await Promise.all([t.db.select().from(productModels), t.db.select().from(supplierListings), t.db.select().from(productImages)]);
      const item = mapCatalogRows(models, listings, images).items.find((i) => i.variant.sku === "SP-10280");
      expect(item?.variant.ramGb).toBe(16);
      expect(item?.variant.keyboardLayout).toBe("EST");
      expect(item?.variant.price.saleCents).toBe(24950);
    });

    it("tarnija väärtusega võrdne sisestus eemaldab paranduse; 'Taasta' eemaldab ühe paranduse", async () => {
      const { updateListingAction, clearOverrideAction } = await import("./products/actions");
      const [current] = await t.db.select().from(supplierListings).where(eq(supplierListings.id, listing.id));
      await updateListingAction(listing.id, null, listingForm(current, { ramGb: String(listing.ramGb), keyboard: "EST" }));
      let [after] = await t.db.select().from(supplierListings).where(eq(supplierListings.id, listing.id));
      expect(after.manualOverrides).toEqual({ keyboard: "EST" });

      expect((await clearOverrideAction("listing", listing.id, "keyboard")).ok).toBe(true);
      [after] = await t.db.select().from(supplierListings).where(eq(supplierListings.id, listing.id));
      expect(after.manualOverrides).toEqual({});
      expect((await clearOverrideAction("listing", listing.id, "status")).ok).toBe(false); // admini väli, mitte parandus
    });

    it("vigane sisend → väljavead, midagi ei salvestata", async () => {
      const { updateListingAction } = await import("./products/actions");
      const [before] = await t.db.select().from(supplierListings).where(eq(supplierListings.id, listing.id));
      const result = await updateListingAction(listing.id, null, listingForm(before, { ramGb: "-4", grade: "Z", resolution: "suur", salePriceCents: "abc" }));
      expect(result.ok).toBe(false);
      if (!result.ok) expect(Object.keys(result.fieldErrors ?? {})).toEqual(expect.arrayContaining(["ramGb", "grade", "resolution", "salePriceCents"]));
      const [after] = await t.db.select().from(supplierListings).where(eq(supplierListings.id, listing.id));
      expect(after.updatedAt).toEqual(before.updatedAt);
    });

    it("mudeli muutmine: parandus + admini väljad (kirjeldus, esiletõstmine, staatus)", async () => {
      const { updateModelAction } = await import("./products/actions");
      const result = await updateModelAction(
        model.id,
        null,
        form({ manufacturer: model.manufacturer, family: model.family, model: model.model, generation: "Gen 2 (parandatud)", screenSizeIn: String(model.screenSizeIn), weightKg: String(model.weightKg), description: "Kirjeldus", status: "ACTIVE", featured: "on" }),
      );
      expect(result.ok).toBe(true);
      const [after] = await t.db.select().from(productModels).where(eq(productModels.id, model.id));
      expect(after.generation).toBe(model.generation);
      expect(after.manualOverrides).toEqual({ generation: "Gen 2 (parandatud)" });
      expect(after.description).toBe("Kirjeldus");
      expect(after.featured).toBe(true);
    });

    it("bulk: peida ja aktiveeri mudelid; vigased ID-d lükatakse tagasi; kustutamist pole", async () => {
      const { bulkModelsAction } = await import("./products/actions");
      expect((await bulkModelsAction(form({ operation: "hide", ids: [model.id] }))).ok).toBe(true);
      let [after] = await t.db.select().from(productModels).where(eq(productModels.id, model.id));
      expect(after.status).toBe("HIDDEN");
      expect((await bulkModelsAction(form({ operation: "activate", ids: [model.id] }))).ok).toBe(true);
      [after] = await t.db.select().from(productModels).where(eq(productModels.id, model.id));
      expect(after.status).toBe("ACTIVE");
      expect((await bulkModelsAction(form({ operation: "delete", ids: [model.id] }))).ok).toBe(false);
      expect((await bulkModelsAction(form({ operation: "hide", ids: ["1 OR 1=1"] }))).ok).toBe(false);
    });
  });

  describe("pildid", () => {
    it("põhipilt, järjekord ja peitmine; alati täpselt üks nähtav põhipilt", async () => {
      const { setMainImageAction, moveImageAction, setImageHiddenAction } = await import("./images/actions");
      const [withImages] = await t.db.select({ id: productImages.productModelId }).from(productImages).limit(1);
      const images = () => t.db.select().from(productImages).where(eq(productImages.productModelId, withImages.id)).orderBy(productImages.position);
      const initial = await images();
      expect(initial.length).toBeGreaterThan(2);

      expect((await setMainImageAction(initial[2].id)).ok).toBe(true);
      let now = await images();
      expect(now[0].id).toBe(initial[2].id);
      expect(now.filter((i) => i.isMain).map((i) => i.id)).toEqual([initial[2].id]);

      expect((await moveImageAction(now[1].id, "up")).ok).toBe(true);
      now = await images();
      expect(now[0].id).toBe(initial[0].id);
      expect(now.map((i) => i.position)).toEqual(now.map((_, index) => index));

      // Põhipildi peitmine → põhipildiks saab esimene nähtav
      const main = now.find((i) => i.isMain)!;
      expect((await setImageHiddenAction(main.id, true)).ok).toBe(true);
      now = await images();
      const mains = now.filter((i) => i.isMain);
      expect(mains).toHaveLength(1);
      expect(mains[0].isHidden).toBe(false);
      expect((await setMainImageAction(main.id)).ok).toBe(false); // peidetud pilt ei saa põhipildiks
      await setImageHiddenAction(main.id, false);
    });
  });

  describe("andmekvaliteet", () => {
    it("SQL-i kontrollid arvestavad parandusi ja vastavad domeeni reeglitele", async () => {
      const { getDataQualityCounts } = await import("./data-quality/queries");
      const before = await getDataQualityCounts();
      const missingCpu = () => before.listings.find((i) => i.key === "missing-cpu")!.count;
      expect(missingCpu()).toBe(0);

      // Parandus "puudub" (null) muudab efektiivse väärtuse puuduvaks
      await t.db.update(supplierListings).set({ manualOverrides: { cpu: null } }).where(eq(supplierListings.id, listing.id));
      const after = await getDataQualityCounts();
      expect(after.listings.find((i) => i.key === "missing-cpu")!.count).toBe(1);
      expect(before.models.find((i) => i.key === "icecat-not-found")!.count).toBe(3);
      await t.db.update(supplierListings).set({ manualOverrides: {} }).where(eq(supplierListings.id, listing.id));
    });
  });

  describe("hinnastamine", () => {
    it("reeglite salvestamine ei muuda hindu; rakendamine muudab ja logib iga muutuse", async () => {
      const { savePricingRulesAction, applyPricingAction } = await import("./pricing/actions");
      const pricesBefore = await t.db.select({ id: supplierListings.id, price: supplierListings.salePriceCents }).from(supplierListings);

      const saved = await savePricingRulesAction(
        null,
        form({
          vatRateBps: "24",
          supplierShippingCents: "15",
          warrantyReserveBps: "3",
          paymentFeeBps: "1,5",
          paymentFeeFixedCents: "0,15",
          minProfitCents: "30",
          minProfitBps: "6",
          minSalePriceCents: "99",
          rounding: "ending-9",
          "band.from": ["0", "300"],
          "band.to": ["300", ""],
          "band.fixed": ["60", "80"],
          "band.pct": ["10", "15"],
        }),
      );
      expect(saved).toMatchObject({ ok: true });
      expect(await t.db.select({ id: supplierListings.id, price: supplierListings.salePriceCents }).from(supplierListings)).toEqual(pricesBefore);
      expect(await t.db.select().from(pricingRules)).toHaveLength(2);

      const applied = await applyPricingAction();
      expect(applied.ok).toBe(true);
      const changed = (await t.db.select().from(auditLogs).where(eq(auditLogs.action, "pricing.apply"))).length;
      expect(changed).toBeGreaterThan(0);
      expect(state.updatedTags).toContain("catalog");

      // Teine rakendamine samade reeglitega ei muuda midagi
      const again = await applyPricingAction();
      expect(again.ok && again.message).toContain("muutus 0 hinda");
    });

    it("vigased vahemikud lükatakse tagasi", async () => {
      const { savePricingRulesAction } = await import("./pricing/actions");
      const base = { vatRateBps: "24", supplierShippingCents: "15", warrantyReserveBps: "3", paymentFeeBps: "1,5", paymentFeeFixedCents: "0", minProfitCents: "30", minProfitBps: "6", minSalePriceCents: "99", rounding: "ending-9" };
      const gap = await savePricingRulesAction(null, form({ ...base, "band.from": ["0", "400"], "band.to": ["300", ""], "band.fixed": ["1", "1"], "band.pct": ["1", "1"] }));
      expect(gap).toMatchObject({ ok: false });
      const badPct = await savePricingRulesAction(null, form({ ...base, vatRateBps: "abc", "band.from": ["0"], "band.to": [""], "band.fixed": ["1"], "band.pct": ["1"] }));
      expect(badPct.ok === false && badPct.fieldErrors?.vatRateBps).toBeTruthy();
    });
  });

  describe("seaded", () => {
    it("salvestamine valideerib, salvestab, auditeerib ja tühjendab seadete vahemälu", async () => {
      const { saveSettingsAction } = await import("./settings/actions");
      const bad = await saveSettingsAction("general", null, form({ storeName: "", supportEmail: "pole-email" }));
      expect(bad.ok).toBe(false);
      if (!bad.ok) expect(Object.keys(bad.fieldErrors ?? {})).toEqual(expect.arrayContaining(["storeName", "supportEmail"]));

      const good = await saveSettingsAction("general", null, form({ storeName: "Testpood", supportEmail: "info@example.com", phone: "", companyName: "Test OÜ", registryCode: "", address: "" }));
      expect(good.ok).toBe(true);
      const [row] = await t.db.select().from(storeSettings).where(eq(storeSettings.key, "general"));
      expect(row.value).toEqual({ storeName: "Testpood", supportEmail: "info@example.com", phone: null, companyName: "Test OÜ", registryCode: null, address: null });
      expect(state.updatedTags).toContain("settings");
      const [audit] = await t.db.select().from(auditLogs).where(eq(auditLogs.action, "settings.update"));
      expect(audit.changes).toMatchObject({ storeName: { to: "Testpood" } });
    });

    it("usaldusriba punkte saab peita", async () => {
      const { saveSettingsAction } = await import("./settings/actions");
      const result = await saveSettingsAction(
        "trustBar",
        null,
        form({ "trust.warranty.label": "Garantii", "trust.warranty.text": "x", "trust.warranty.order": "0", "trust.returns.label": "Tagastus", "trust.returns.text": "y", "trust.returns.order": "1", "trust.returns.enabled": "on" }),
      );
      expect(result.ok).toBe(true);
      const [row] = await t.db.select().from(storeSettings).where(eq(storeSettings.key, "trustBar"));
      expect((row.value as { items: { key: string; enabled: boolean }[] }).items.map((i) => [i.key, i.enabled])).toEqual([
        ["warranty", false],
        ["returns", true],
      ]);
    });
  });

  describe("turvalisus", () => {
    it("ilma sessioonita ei õnnestu ükski muutev toiming", async () => {
      const saved = state.admin;
      state.admin = null;
      try {
        const products = await import("./products/actions");
        const images = await import("./images/actions");
        const pricing = await import("./pricing/actions");
        const settings = await import("./settings/actions");
        const results = await Promise.all([
          products.updateListingAction(listing.id, null, listingForm(listing, { ramGb: "64" })),
          products.bulkModelsAction(form({ operation: "hide", ids: [model.id] })),
          images.setImageHiddenAction("00000000-0000-0000-0000-000000000000", true),
          pricing.applyPricingAction(),
          settings.saveSettingsAction("general", null, form({ storeName: "Häkitud" })),
        ]);
        for (const result of results) expect(result).toEqual({ ok: false, error: "Sessioon on aegunud. Logi uuesti sisse." });
        const [after] = await t.db.select().from(supplierListings).where(eq(supplierListings.id, listing.id));
        expect(after.manualOverrides).not.toHaveProperty("ramGb", 64);
      } finally {
        state.admin = saved;
      }
    });

    it("SQL-süst otsingus ei tee kahju (parameetrid, mitte stringide liitmine)", async () => {
      const { listListings } = await import("./products/queries");
      const result = await listListings({ q: "'; DROP TABLE supplier_listings; --", page: 1 });
      expect(result.total).toBe(0);
      const result2 = await listListings({ q: "%_\\", page: 1 });
      expect(result2.total).toBe(0);
      expect((await t.db.select().from(supplierListings)).length).toBe(46);
    });

    it("vigased ID-d lükatakse tagasi enne andmebaasi", async () => {
      const { updateModelAction } = await import("./products/actions");
      expect(await updateModelAction("../../etc/passwd", null, form({}))).toEqual({ ok: false, error: "Vigane mudeli ID" });
    });

    it("HTML-i sisaldav tekst salvestub tekstina (React kuvab selle escape'ituna)", async () => {
      const { saveSettingsAction } = await import("./settings/actions");
      await saveSettingsAction("warranty", null, form({ text: "<script>alert(1)</script>" }));
      const [row] = await t.db.select().from(storeSettings).where(eq(storeSettings.key, "warranty"));
      expect(row.value).toEqual({ text: "<script>alert(1)</script>" });
    });
  });
});

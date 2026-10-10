import { and, eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createTestDatabase, hasTestDatabase, type TestDatabase } from "@/test/test-db";
import { adminUsers, auditLogs, discountCodes, discountRedemptions, productModels, supplierListings } from "@/server/db/schema";

/**
 * Sooduskoodid päris PostgreSQL-is (ajutine skeem): admini toimingud + audit, ostukorvi serveripoolne
 * arvutus, kliendi võltsimiskatsed, piirang, kasutuste (redemption) arhitektuur.
 */

const state = vi.hoisted(() => ({
  db: null as unknown,
  admin: null as null | { id: string; email: string; name: string; role: string; sessionId: string },
  ip: "10.0.0.1",
}));

vi.mock("next/cache", () => ({ updateTag: () => {}, cacheTag: () => {}, cacheLife: () => {} }));
vi.mock("@/server/db/client", async (importOriginal) => ({ ...(await importOriginal<object>()), getDb: () => state.db, isDatabaseConfigured: () => true }));
vi.mock("@/server/logging/system-log", () => ({ writeSystemLog: async () => {}, newErrorId: () => "TESTID", errorMessage: (e: unknown) => String(e) }));
vi.mock("@/server/auth/auth", () => {
  class UnauthorizedError extends Error {}
  return {
    UnauthorizedError,
    getClientMeta: async () => ({ ip: state.ip, userAgent: "vitest" }),
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
const plain = (text: string) => text.replace(/ /g, " ");

describe.skipIf(!hasTestDatabase)("sooduskoodid (andmebaas)", () => {
  let t: TestDatabase;
  /** Avalikud pakkumise ID-d ostukorvi jaoks */
  let dellRef: string;
  let lenovoRef: string;
  let dellPrice: number;
  let lenovoPrice: number;
  let lenovoListingId: string;

  beforeAll(async () => {
    t = await createTestDatabase();
    state.db = t.db;
    const { seedCatalog, publicListingId } = await import("@/server/db/seed/seed-catalog");
    const { loadSeedSources } = await import("@/server/db/seed/seed-sources");
    await seedCatalog(t.db, (await loadSeedSources()).sources);
    const [user] = await t.db.insert(adminUsers).values({ email: "admin@example.com", name: "Admin", passwordHash: "scrypt$x" }).returning();
    state.admin = { id: user.id, email: user.email, name: user.name, role: user.role, sessionId: "s" };

    const pick = async (manufacturer: string) => {
      const [row] = await t.db
        .select({ listing: supplierListings })
        .from(supplierListings)
        .innerJoin(productModels, eq(productModels.id, supplierListings.productModelId))
        .where(and(eq(productModels.manufacturer, manufacturer), eq(supplierListings.status, "ACTIVE")))
        .orderBy(supplierListings.sku)
        .limit(1);
      return { ref: publicListingId(row.listing.supplier, row.listing.supplierProductId), price: row.listing.salePriceCents!, id: row.listing.id };
    };
    const dell = await pick("dell");
    const lenovo = await pick("lenovo");
    [dellRef, dellPrice, lenovoRef, lenovoPrice, lenovoListingId] = [dell.ref, dell.price, lenovo.ref, lenovo.price, lenovo.id];
  }, 120_000);
  afterAll(async () => {
    await t?.cleanup();
  });
  beforeEach(() => {
    state.ip = `10.0.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}`;
  });

  const base = { name: "Test", scope: "ALL_PRODUCTS", status: "ACTIVE", respectMinimumMargin: "" };
  const cart = () => [
    { variantId: dellRef, quantity: 1 },
    { variantId: lenovoRef, quantity: 1 },
  ];
  const findCode = async (normalized: string) => (await t.db.select().from(discountCodes).where(eq(discountCodes.normalizedCode, normalized)))[0];

  describe("admin", () => {
    it("loob protsendi- ja summakoodi; kood normaliseeritakse; audit kirjutatakse", async () => {
      const { createDiscountAction } = await import("@/server/admin/discounts/actions");
      const pct = await createDiscountAction(null, form({ ...base, code: "Dell10", name: "Delli kampaania", type: "PERCENTAGE", value: "10", scope: "SELECTED_MANUFACTURERS", manufacturers: ["dell"] }));
      expect(pct.ok).toBe(true);
      const fixed = await createDiscountAction(null, form({ ...base, code: "kool75", name: "Koolide eripakkumine", type: "FIXED_AMOUNT", value: "75", usageLimit: "500" }));
      expect(fixed.ok).toBe(true);

      const dell10 = await findCode("DELL10");
      expect(dell10).toMatchObject({ code: "Dell10", type: "PERCENTAGE", value: 1000, status: "ACTIVE", active: true, createdBy: "admin@example.com" });
      const [audit] = await t.db.select().from(auditLogs).where(and(eq(auditLogs.entityId, dell10.id), eq(auditLogs.action, "discount.create")));
      expect(audit.changes).toMatchObject({ normalizedCode: { from: null, to: "DELL10" }, manufacturers: { to: ["dell"] } });
    });

    it("sama kood teise kirjapildiga on keelatud (normalized_code UNIQUE)", async () => {
      const { createDiscountAction } = await import("@/server/admin/discounts/actions");
      const result = await createDiscountAction(null, form({ ...base, code: "  KOOL75 ", type: "FIXED_AMOUNT", value: "10" }));
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.fieldErrors?.code).toMatch(/juba olemas/);
      // Ka otse andmebaasi ei saa duplikaati panna
      await expect(t.db.insert(discountCodes).values({ code: "Kool75", normalizedCode: "KOOL75", name: "x", type: "FIXED_AMOUNT", value: 1 })).rejects.toThrow();
    });

    it("muutmine kirjutab auditisse vana → uus väärtuse", async () => {
      const { updateDiscountAction } = await import("@/server/admin/discounts/actions");
      const kool = await findCode("KOOL75");
      const result = await updateDiscountAction(kool.id, null, form({ ...base, code: "KOOL75", name: "Koolide eripakkumine", type: "FIXED_AMOUNT", value: "75", usageLimit: "500", minimumSubtotal: "700" }));
      expect(result.ok).toBe(true);
      const [audit] = await t.db.select().from(auditLogs).where(and(eq(auditLogs.entityId, kool.id), eq(auditLogs.action, "discount.update")));
      expect(audit.changes).toEqual({ minimumSubtotalCents: { from: null, to: 70_000 }, code: { from: "kool75", to: "KOOL75" } });
      expect(audit.adminEmail).toBe("admin@example.com");
    });

    it("duplikaat on MUSTAND uue koodiga ja samade reeglitega", async () => {
      const { duplicateDiscountAction } = await import("@/server/admin/discounts/actions");
      const dell10 = await findCode("DELL10");
      const result = await duplicateDiscountAction(dell10.id);
      expect(result.ok).toBe(true);
      const copy = await findCode("DELL10-COPY");
      expect(copy).toMatchObject({ status: "DRAFT", active: false, type: "PERCENTAGE", value: 1000, usageCount: 0, scope: "SELECTED_MANUFACTURERS" });
      expect((await duplicateDiscountAction(dell10.id)).ok).toBe(true);
      expect(await findCode("DELL10-COPY2")).toBeTruthy();
    });

    it("olekud: lülita välja → aktiveeri → arhiveeri; arhiveeritut ei saa muuta; iga samm auditis", async () => {
      const { setDiscountStatusAction, updateDiscountAction } = await import("@/server/admin/discounts/actions");
      const copy = await findCode("DELL10-COPY2");
      expect((await setDiscountStatusAction(copy.id, "DISABLED")).ok).toBe(false); // mustandit ei saa välja lülitada
      expect((await setDiscountStatusAction(copy.id, "ACTIVE")).ok).toBe(true);
      expect((await setDiscountStatusAction(copy.id, "DISABLED")).ok).toBe(true);
      expect((await setDiscountStatusAction(copy.id, "ARCHIVED")).ok).toBe(true);
      expect((await setDiscountStatusAction(copy.id, "ACTIVE")).ok).toBe(false);
      const edit = await updateDiscountAction(copy.id, null, form({ ...base, code: "DELL10-COPY2", type: "PERCENTAGE", value: "50" }));
      expect(edit).toMatchObject({ ok: false });
      const actions = (await t.db.select().from(auditLogs).where(eq(auditLogs.entityId, copy.id))).map((a) => a.action).sort();
      expect(actions).toEqual(["discount.activate", "discount.archive", "discount.disable", "discount.duplicate"]);
      // Arhiveeritud kood jääb andmebaasi
      expect(await findCode("DELL10-COPY2")).toMatchObject({ status: "ARCHIVED" });
    });

    it("ilma admini sessioonita ei saa koodi luua ega muuta", async () => {
      const { createDiscountAction, setDiscountStatusAction } = await import("@/server/admin/discounts/actions");
      const saved = state.admin;
      state.admin = null;
      try {
        expect(await createDiscountAction(null, form({ ...base, code: "HAKK99", type: "PERCENTAGE", value: "99" }))).toEqual({ ok: false, error: "Sessioon on aegunud. Logi uuesti sisse." });
        const kool = await findCode("KOOL75");
        expect((await setDiscountStatusAction(kool.id, "DISABLED")).ok).toBe(false);
        expect(await findCode("HAKK99")).toBeUndefined();
        expect((await findCode("KOOL75")).status).toBe("ACTIVE");
      } finally {
        state.admin = saved;
      }
    });
  });

  describe("ostukorv (serveripoolne arvutus)", () => {
    it("DELL10: tõstutundetu; soodustus ainult Delli tootelt", async () => {
      const { resolveCart } = await import("@/server/cart/cart-actions");
      const result = await resolveCart(cart(), "dell10");
      expect(result.discount).toMatchObject({ valid: true, code: "Dell10", eligibleSubtotalCents: dellPrice });
      expect(result.discountCents).toBe(Math.round(dellPrice * 0.1));
      expect(result.totalCents).toBe(dellPrice + lenovoPrice - result.discountCents);
      // Avalik vastus ei sisalda sisemist infot
      expect(Object.keys(result.discount!).sort()).toEqual(["code", "discountAmountCents", "eligibleSubtotalCents", "freeShipping", "message", "reason", "valid"]);
    });

    it("miinimumsumma: alla piiri → selge teade; piiri ületades kehtib", async () => {
      const { createDiscountAction } = await import("@/server/admin/discounts/actions");
      const { resolveCart } = await import("@/server/cart/cart-actions");
      // Piir = Delli toote hind + 50 € → ainult Dell jääb alla, Dell + Lenovo ületab
      const minimumEuros = Math.ceil(dellPrice / 100) + 50;
      await createDiscountAction(null, form({ ...base, code: "SAVE100", type: "FIXED_AMOUNT", value: "100", minimumSubtotal: String(minimumEuros) }));
      const low = await resolveCart([{ variantId: dellRef, quantity: 1 }], "SAVE100");
      expect(low.discount?.valid).toBe(false);
      expect(plain(low.discount!.message)).toBe(`Sooduskoodi kasutamiseks peab ostukorvi summa olema vähemalt ${minimumEuros} €.`);
      expect(low.totalCents).toBe(low.subtotalCents);
      const enough = await resolveCart(cart(), "SAVE100");
      expect(enough.discount?.valid).toBe(lenovoPrice >= 5_000);
      expect(enough.discountCents).toBe(10_000);
    });

    it("KLIENDI VÕLTSIMINE: brauseri saadetud summa, hind ega mitu koodi ei mõjuta tulemust", async () => {
      const { resolveCart } = await import("@/server/cart/cart-actions");
      const tampered = [
        { variantId: dellRef, quantity: 1, priceCents: 1, discountAmountCents: 999_999 },
        { variantId: lenovoRef, quantity: 1, saleCents: 1 },
      ];
      const honest = await resolveCart(cart(), "DELL10");
      const result = await resolveCart(tampered, "DELL10");
      expect(result.subtotalCents).toBe(honest.subtotalCents);
      expect(result.discountCents).toBe(honest.discountCents);
      // Objekt koodi asemel või mitu koodi korraga → soodustust pole
      expect((await resolveCart(cart(), { code: "DELL10", discountAmountCents: 50_000 })).discount).toBeNull();
      expect((await resolveCart(cart(), ["DELL10", "KOOL75"])).discount).toBeNull();
    });

    it("kontrollimine ei suurenda kasutuste arvu", async () => {
      const { resolveCart } = await import("@/server/cart/cart-actions");
      for (let i = 0; i < 3; i++) await resolveCart(cart(), "DELL10");
      expect((await findCode("DELL10")).usageCount).toBe(0);
      expect(await t.db.select().from(discountRedemptions)).toEqual([]);
    });

    it("aegunud, välja lülitatud ja arhiveeritud kood", async () => {
      const { createDiscountAction, setDiscountStatusAction } = await import("@/server/admin/discounts/actions");
      const { resolveCart } = await import("@/server/cart/cart-actions");
      await createDiscountAction(null, form({ ...base, code: "VANA10", type: "PERCENTAGE", value: "10", startsAt: "2025-01-01T00:00", expiresAt: "2025-01-31T23:59" }));
      expect((await resolveCart(cart(), "vana10")).discount?.message).toBe("Sooduskood on aegunud.");
      await createDiscountAction(null, form({ ...base, code: "TULEV10", type: "PERCENTAGE", value: "10", startsAt: "2099-01-01T00:00" }));
      expect((await resolveCart(cart(), "TULEV10")).discount?.message).toBe("Sooduskood ei ole veel aktiivne.");

      const kool = await findCode("KOOL75");
      await setDiscountStatusAction(kool.id, "DISABLED");
      expect((await resolveCart(cart(), "KOOL75")).discount?.message).toBe("See sooduskood ei ole hetkel aktiivne.");
      await setDiscountStatusAction(kool.id, "ACTIVE");
      expect((await resolveCart(cart(), "OLEMATU1")).discount?.message).toBe("Sooduskoodi ei leitud.");
      expect((await resolveCart(cart(), "DELL10-COPY2")).discount?.message).toBe("Sooduskoodi ei leitud."); // arhiveeritud
    });

    it("piirang: 10 vale koodi samalt IP-lt → blokeeritud; teine IP töötab; avalik action samuti", async () => {
      const { resolveCart } = await import("@/server/cart/cart-actions");
      const { validateDiscountAction } = await import("./discount-actions");
      state.ip = "10.99.99.99";
      for (let i = 0; i < 10; i++) await resolveCart(cart(), `VALE${i}AB`);
      expect((await resolveCart(cart(), "DELL10")).discount).toMatchObject({ valid: false, reason: "RATE_LIMITED" });
      expect(await validateDiscountAction("DELL10", cart())).toMatchObject({ valid: false, reason: "RATE_LIMITED" });
      state.ip = "10.99.99.98";
      expect((await validateDiscountAction("DELL10", cart())).valid).toBe(true);
    });
  });

  describe("eelvaade ja marginaal", () => {
    it("eelvaade: DELL10 ei kehti Lenovo konfiguratsioonile; test-summa", async () => {
      const { previewDiscountAction } = await import("@/server/admin/discounts/actions");
      const dell10 = await findCode("DELL10");
      const lenovoOnly = await previewDiscountAction(dell10.id, { listings: [{ id: lenovoListingId, quantity: 1 }] });
      expect(lenovoOnly).toMatchObject({ ok: true, valid: false, message: "Sooduskood ei kehti ühelegi ostukorvis olevale tootele." });
      const kool = await findCode("KOOL75");
      const sum = await previewDiscountAction(kool.id, { subtotalEuros: "800", listings: [] });
      expect(sum).toMatchObject({ ok: true, valid: true, discountCents: 7_500, totalCents: 72_500 });
    });

    it("marginaalikaitse: 90% soodustus piiratakse päris ostuhinna järgi", async () => {
      const { createDiscountAction, previewDiscountAction } = await import("@/server/admin/discounts/actions");
      await createDiscountAction(null, form({ ...base, code: "MEGA90", type: "PERCENTAGE", value: "90", respectMinimumMargin: "on" }));
      const mega = await findCode("MEGA90");
      expect(mega.respectMinimumMargin).toBe(true);
      const preview = await previewDiscountAction(mega.id, { listings: [{ id: lenovoListingId, quantity: 1 }] });
      expect(preview.ok && preview.marginLimitedCount).toBe(1);
      expect(preview.ok && preview.discountCents).toBeLessThan(Math.round(lenovoPrice * 0.9));
    });
  });

  describe("kasutused (tellimuste süsteemi jaoks)", () => {
    it("reserveeri → kinnita → tühista; piirang kehtib reserveeringutele; usage_count = kinnitatud", async () => {
      const { reserveRedemption, confirmRedemption, cancelRedemption, RedemptionError } = await import("./redemptions");
      const { loadDiscountRule } = await import("./discount-service");
      const { evaluateDiscount } = await import("@/domain/discounts/discount-engine");
      const { createDiscountAction } = await import("@/server/admin/discounts/actions");
      await createDiscountAction(null, form({ ...base, code: "UKS1", type: "FIXED_AMOUNT", value: "10", usageLimit: "1" }));
      const row = await findCode("UKS1");
      const rule = (await loadDiscountRule(t.db, "uks1"))!;
      const result = evaluateDiscount(rule, [{ listing: "SP-X", productModel: "x", manufacturer: "dell", unitPriceCents: 50_000, quantity: 1 }], new Date());
      if (!result.valid) throw new Error("peaks kehtima");

      // Kasutus viitab päris tellimusele (välisvõti) — loome kaks minimaalset tellimust
      const { orders } = await import("@/server/db/schema");
      const minimalOrder = (n: string) => ({
        orderNumber: `SL-26-TEST${n}`, isTest: false, customerEmail: "a@example.com", customerFirstName: "A", customerLastName: "B", customerPhone: "+3725000000",
        shippingMethodCode: "STANDARD", shippingMethodName: "Standardtarne", shippingAddressLine1: "Tee 1", shippingCity: "Tallinn", shippingPostalCode: "10115", shippingCountry: "EE",
        subtotalCents: 50_000, discountAmountCents: 1_000, shippingAmountCents: 0, totalCents: 49_000, idempotencyKeyHash: `key${n}`, publicAccessTokenHash: `tok${n}`,
      });
      const [{ id: orderA }, { id: orderB }] = await t.db.insert(orders).values([minimalOrder("AA"), minimalOrder("BB")]).returning({ id: orders.id });
      const reserved = await t.db.transaction((tx) => reserveRedemption(tx, { discountCodeId: row.id, orderId: orderA, rule, result }));
      expect(reserved).toMatchObject({ status: "PENDING", codeSnapshot: "UKS1", discountAmountCents: 1_000 });
      await expect(t.db.transaction((tx) => reserveRedemption(tx, { discountCodeId: row.id, orderId: orderB, rule, result }))).rejects.toBeInstanceOf(RedemptionError);

      expect(await t.db.transaction((tx) => confirmRedemption(tx, reserved.id))).toBe(1);
      expect(await t.db.transaction((tx) => confirmRedemption(tx, reserved.id))).toBe(1); // korduv kinnitus ei loe topelt
      expect((await findCode("UKS1")).usageCount).toBe(1);
      const { resolveCart } = await import("@/server/cart/cart-actions");
      expect((await resolveCart(cart(), "UKS1")).discount?.message).toBe("See sooduskood ei ole hetkel aktiivne.");

      expect(await t.db.transaction((tx) => cancelRedemption(tx, reserved.id))).toBe(0);
      expect((await findCode("UKS1")).usageCount).toBe(0);
    });
  });
});

import { and, eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createTestDatabase, hasTestDatabase, type TestDatabase } from "@/test/test-db";
import {
  adminUsers,
  auditLogs,
  discountCodes,
  discountRedemptions,
  orderInternalNotes,
  orderItems,
  orderStatusHistory,
  orders,
  productModels,
  storeSettings,
  supplierListings,
} from "@/server/db/schema";

/**
 * Kassa ja tellimused päris PostgreSQL-is (ajutine skeem). Next.js-i päringukontekst (küpsised, päised,
 * sessioon, vahemälu) on asendatud testiversioonidega.
 */

const state = vi.hoisted(() => ({
  db: null as unknown,
  admin: null as null | { id: string; email: string; name: string; role: string; sessionId: string },
  ip: "10.1.0.1",
  sameOrigin: true,
  cookies: new Map<string, string>(),
}));

vi.mock("next/cache", () => ({ updateTag: () => {}, cacheTag: () => {}, cacheLife: () => {}, refresh: () => {} }));
vi.mock("next/headers", () => ({
  cookies: async () => ({ set: (name: string, value: string) => state.cookies.set(name, value), get: (name: string) => (state.cookies.has(name) ? { value: state.cookies.get(name) } : undefined) }),
  headers: async () => new Headers(),
}));
vi.mock("@/server/db/client", async (importOriginal) => ({ ...(await importOriginal<object>()), getDb: () => state.db, isDatabaseConfigured: () => true }));
vi.mock("@/server/logging/system-log", () => ({ writeSystemLog: async () => {}, newErrorId: () => "TESTID", errorMessage: (e: unknown) => String(e) }));
vi.mock("@/server/auth/auth", () => {
  class UnauthorizedError extends Error {}
  return {
    UnauthorizedError,
    getClientMeta: async () => ({ ip: state.ip, userAgent: "vitest" }),
    assertSameOrigin: async () => {
      if (!state.sameOrigin) throw new UnauthorizedError("Päring teiselt saidilt on keelatud");
    },
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

const form = {
  firstName: "Mari",
  lastName: "Maasikas",
  email: "mari@example.com",
  phone: "+372 5123 4567",
  addressLine1: "Pärnu mnt 1",
  addressLine2: null,
  city: "Tallinn",
  postalCode: "10115",
  country: "EE" as const,
  isCompany: false,
  companyName: null,
  companyRegistryCode: null,
  companyVatNumber: null,
  customerNote: null,
};
const fd = (values: Record<string, string | string[]>) => {
  const data = new FormData();
  for (const [key, value] of Object.entries(values)) for (const v of [value].flat()) data.append(key, v);
  return data;
};

describe.skipIf(!hasTestDatabase)("kassa ja tellimused (andmebaas)", () => {
  let t: TestDatabase;
  let dell: { ref: string; id: string; price: number; stock: number };
  let lenovo: { ref: string; id: string; price: number; stock: number };

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
        .select({ l: supplierListings })
        .from(supplierListings)
        .innerJoin(productModels, eq(productModels.id, supplierListings.productModelId))
        .where(and(eq(productModels.manufacturer, manufacturer), eq(supplierListings.status, "ACTIVE")))
        .orderBy(supplierListings.sku)
        .limit(1);
      return { ref: publicListingId(row.l.supplier, row.l.supplierProductId), id: row.l.id, price: row.l.salePriceCents!, stock: row.l.stock! };
    };
    dell = await pick("dell");
    lenovo = await pick("lenovo");
  }, 120_000);
  afterAll(async () => {
    await t?.cleanup();
  });
  beforeEach(() => {
    state.sameOrigin = true;
    state.ip = `10.1.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}`;
  });

  /** Kliendi tavaline voog: kokkuvõte → esitamine nähtud summadega */
  const checkout = async (items: { variantId: string; quantity: number }[], couponCode: string | null = null, key = crypto.randomUUID()) => {
    const { computeCheckout } = await import("@/server/checkout/checkout-service");
    const { placeOrder } = await import("./order-service");
    const { quote } = await computeCheckout(t.db, { items, couponCode });
    const result = await placeOrder(t.db, {
      idempotencyKey: key,
      items,
      couponCode,
      form,
      acknowledged: { lines: quote.lines.map((l) => ({ variantId: l.variantId, unitPriceCents: l.unitPriceCents })), totalCents: quote.totalCents, discountCents: quote.discount?.amountCents ?? 0 },
    });
    return { quote, result };
  };
  const orderBy = async (orderNumber: string) => (await t.db.select().from(orders).where(eq(orders.orderNumber, orderNumber)))[0];

  describe("tellimuse loomine", () => {
    it("1/6. kehtiv külalisost prototüübis → TEST tellimus, serveri summad, algne ajalugu", async () => {
      const { quote, result } = await checkout([{ variantId: dell.ref, quantity: 1 }]);
      expect(result.status).toBe("CREATED");
      if (result.status !== "CREATED") return;
      const order = await orderBy(result.orderNumber);
      expect(order).toMatchObject({ isTest: true, status: "CREATED", paymentStatus: "NOT_STARTED", subtotalCents: dell.price, discountAmountCents: 0, shippingAmountCents: 699, totalCents: dell.price + 699, customerEmail: "mari@example.com" });
      expect(quote.mode).toBe("TEST");
      const history = await t.db.select().from(orderStatusHistory).where(eq(orderStatusHistory.orderId, order.id));
      expect(history.map((h) => [h.kind, h.fromStatus, h.toStatus, h.source])).toEqual([
        ["ORDER", null, "CREATED", "CHECKOUT"],
        ["PAYMENT", null, "NOT_STARTED", "CHECKOUT"],
      ]);
      // Testtellimus ei vähenda laoseisu
      const [listing] = await t.db.select().from(supplierListings).where(eq(supplierListings.id, dell.id));
      expect(listing.stock).toBe(dell.stock);
    });

    it("18. tellimuse rida on snapshot — kataloogi hilisem muutus vana tellimust ei muuda", async () => {
      const { result } = await checkout([{ variantId: lenovo.ref, quantity: 1 }]);
      if (result.status !== "CREATED") throw new Error(result.status);
      const order = await orderBy(result.orderNumber);
      const [before] = await t.db.select().from(orderItems).where(eq(orderItems.orderId, order.id));
      expect(before).toMatchObject({ unitPriceCents: lenovo.price, quantity: 1, lineTotalCents: lenovo.price, supplierListingId: lenovo.id });
      expect(before.cpu).toBeTruthy();
      await t.db.update(supplierListings).set({ salePriceCents: lenovo.price + 50_000, ramGb: 64, grade: "C" }).where(eq(supplierListings.id, lenovo.id));
      await t.db.update(productModels).set({ manualOverrides: { model: "Ümber nimetatud" } }).where(eq(productModels.id, before.productModelId!));
      const [after] = await t.db.select().from(orderItems).where(eq(orderItems.orderId, order.id));
      expect(after).toEqual(before);
      // Taasta
      await t.db.update(supplierListings).set({ salePriceCents: lenovo.price, ramGb: before.ramGb, grade: before.grade }).where(eq(supplierListings.id, lenovo.id));
      await t.db.update(productModels).set({ manualOverrides: {} }).where(eq(productModels.id, before.productModelId!));
    });

    it("17. tellimuse numbrid on unikaalsed ja mitte järjekorranumbrid", async () => {
      const numbers = (await t.db.select({ n: orders.orderNumber }).from(orders)).map((r) => r.n);
      expect(new Set(numbers).size).toBe(numbers.length);
      for (const n of numbers) expect(n).toMatch(/^SL-\d{2}-[A-Z2-9]{6}$/);
    });

    it("19. tehing: kui üks osa ebaõnnestub, ei jää poolikut tellimust", async () => {
      const { insertOrderRecords } = await import("./order-service");
      const before = (await t.db.select().from(orders)).length;
      const bad = {
        order: { orderNumber: "SL-26-ROLLBK", isTest: true, customerEmail: "a@b.ee", customerFirstName: "A", customerLastName: "B", customerPhone: "+3725000000", shippingMethodCode: "STANDARD", shippingMethodName: "S", shippingAddressLine1: "T 1", shippingCity: "T", shippingPostalCode: "10115", shippingCountry: "EE", subtotalCents: 100, shippingAmountCents: 0, totalCents: 100, idempotencyKeyHash: "rollback", publicAccessTokenHash: "x" },
        // Kogus 0 rikub CHECK piirangut → tehing tühistatakse
        items: [{ position: 0, sku: "X", manufacturer: "X", model: "X", title: "X", quantity: 0, unitPriceCents: 100, lineSubtotalCents: 0, lineTotalCents: 0 }],
      };
      await expect(t.db.transaction((tx) => insertOrderRecords(tx, bad))).rejects.toThrow();
      expect((await t.db.select().from(orders)).length).toBe(before);
      expect(await orderBy("SL-26-ROLLBK")).toBeUndefined();
    });

    it("20. idempotentsus: sama võti → sama tellimus (ka samaaegselt), uut ei looda", async () => {
      const key = crypto.randomUUID();
      const count = async () => (await t.db.select().from(orders)).length;
      const before = await count();
      const [a, b] = await Promise.all([checkout([{ variantId: dell.ref, quantity: 1 }], null, key), checkout([{ variantId: dell.ref, quantity: 1 }], null, key)]);
      const third = await checkout([{ variantId: dell.ref, quantity: 1 }], null, key);
      const numbers = [a.result, b.result, third.result].map((r) => ("orderNumber" in r ? r.orderNumber : null));
      expect(new Set(numbers).size).toBe(1);
      expect(third.result.status).toBe("EXISTING");
      expect(await count()).toBe(before + 1);
    });
  });

  describe("serveri summad", () => {
    it("7/8/9. hinnamuutus: kasutatakse andmebaasi hinda; kliendi nähtud vana hinnaga tellimust ei looda", async () => {
      const { placeOrder } = await import("./order-service");
      const before = (await t.db.select().from(orders)).length;
      await t.db.update(supplierListings).set({ salePriceCents: dell.price + 2_000 }).where(eq(supplierListings.id, dell.id));
      const result = await placeOrder(t.db, {
        idempotencyKey: crypto.randomUUID(),
        items: [{ variantId: dell.ref, quantity: 1 }],
        couponCode: null,
        form,
        // Klient "nägi" vana hinda (või võltsis seda)
        acknowledged: { lines: [{ variantId: dell.ref, unitPriceCents: dell.price }], totalCents: dell.price + 699, discountCents: 0 },
      });
      expect(result.status).toBe("REVIEW");
      if (result.status === "REVIEW") {
        expect(result.messages).toContain("Ühe toote hind on pärast ostukorvi lisamist muutunud.");
        expect(result.priceChanges).toEqual([expect.objectContaining({ oldCents: dell.price, newCents: dell.price + 2_000 })]);
        expect(result.quote.subtotalCents).toBe(dell.price + 2_000);
      }
      expect((await t.db.select().from(orders)).length).toBe(before);
      // Pärast uue summa kinnitamist luuakse tellimus uue hinnaga
      const confirmed = await checkout([{ variantId: dell.ref, quantity: 1 }]);
      if (confirmed.result.status !== "CREATED") throw new Error("peaks looma");
      expect((await orderBy(confirmed.result.orderNumber)).subtotalCents).toBe(dell.price + 2_000);
      await t.db.update(supplierListings).set({ salePriceCents: dell.price }).where(eq(supplierListings.id, dell.id));
    });

    it("10. mitteaktiivne pakkumine → tellimust ei looda", async () => {
      await t.db.update(supplierListings).set({ status: "HIDDEN" }).where(eq(supplierListings.id, lenovo.id));
      const { result } = await checkout([{ variantId: lenovo.ref, quantity: 1 }]);
      expect(result.status).toBe("REVIEW");
      if (result.status === "REVIEW") expect(result.messages).toContain("Toode ei ole enam saadaval.");
      await t.db.update(supplierListings).set({ status: "ACTIVE" }).where(eq(supplierListings.id, lenovo.id));
    });

    it("11. kogus üle laoseisu → tellimust ei looda", async () => {
      const { result } = await checkout([{ variantId: dell.ref, quantity: dell.stock + 1 }]);
      expect(result.status).toBe("REVIEW");
      if (result.status === "REVIEW") {
        expect(result.quote.issues[0]).toMatchObject({ kind: "INSUFFICIENT_STOCK", available: dell.stock, message: "Valitud kogus ei ole enam saadaval." });
      }
    });

    it("BLOCKED: prototüüp väljas + makseteenust pole → päris tellimust ei looda", async () => {
      await t.db.update(storeSettings).set({ value: { prototypeMode: false, currency: "EUR", locale: "et-EE" } }).where(eq(storeSettings.key, "store"));
      const { result } = await checkout([{ variantId: dell.ref, quantity: 1 }]);
      expect(result.status).toBe("BLOCKED");
      await t.db.update(storeSettings).set({ value: { prototypeMode: true, currency: "EUR", locale: "et-EE" } }).where(eq(storeSettings.key, "store"));
    });
  });

  describe("sooduskood kassas", () => {
    const createCode = async (values: Record<string, string | string[]>) => {
      const { createDiscountAction } = await import("@/server/admin/discounts/actions");
      const r = await createDiscountAction(null, fd({ name: "Test", scope: "ALL_PRODUCTS", status: "ACTIVE", respectMinimumMargin: "", ...values }));
      if (!r.ok) throw new Error(r.error);
    };

    it("14. tootja piirang: soodustus ainult Delli real", async () => {
      await createCode({ code: "DELL10", type: "PERCENTAGE", value: "10", scope: "SELECTED_MANUFACTURERS", manufacturers: ["dell"] });
      const { result } = await checkout([{ variantId: dell.ref, quantity: 1 }, { variantId: lenovo.ref, quantity: 1 }], "dell10");
      if (result.status !== "CREATED") throw new Error(result.status);
      const order = await orderBy(result.orderNumber);
      expect(order).toMatchObject({ discountCode: "DELL10", discountType: "PERCENTAGE", discountValue: 1000, discountAmountCents: Math.round(dell.price * 0.1) });
      expect(order.totalCents).toBe(dell.price + lenovo.price - order.discountAmountCents + order.shippingAmountCents);
      const items = await t.db.select().from(orderItems).where(eq(orderItems.orderId, order.id)).orderBy(orderItems.position);
      expect(items.map((i) => i.discountAmountCents)).toEqual([Math.round(dell.price * 0.1), 0]);
      expect(order.discountSnapshot).toMatchObject({ code: "DELL10", discountAmountApplied: order.discountAmountCents });
    });

    it("12. kood valideeritakse kassas uuesti: kood lülitati vahepeal välja → ülevaatus, tellimust ei looda", async () => {
      const { computeCheckout } = await import("@/server/checkout/checkout-service");
      const { placeOrder } = await import("./order-service");
      const items = [{ variantId: dell.ref, quantity: 1 }];
      const { quote } = await computeCheckout(t.db, { items, couponCode: "DELL10" });
      expect(quote.discount?.amountCents).toBeGreaterThan(0);
      await t.db.update(discountCodes).set({ status: "DISABLED" }).where(eq(discountCodes.normalizedCode, "DELL10"));
      const result = await placeOrder(t.db, {
        idempotencyKey: crypto.randomUUID(),
        items,
        couponCode: "DELL10",
        form,
        acknowledged: { lines: quote.lines.map((l) => ({ variantId: l.variantId, unitPriceCents: l.unitPriceCents })), totalCents: quote.totalCents, discountCents: quote.discount!.amountCents },
      });
      expect(result.status).toBe("REVIEW");
      if (result.status === "REVIEW") expect(result.messages).toContain("Sooduskood: See sooduskood ei ole hetkel aktiivne.");
      await t.db.update(discountCodes).set({ status: "ACTIVE" }).where(eq(discountCodes.normalizedCode, "DELL10"));
    });

    it("13. aegunud kood lükatakse tagasi", async () => {
      await createCode({ code: "VANA20", type: "PERCENTAGE", value: "20", startsAt: "2025-01-01T00:00", expiresAt: "2025-02-01T00:00" });
      const { result } = await checkout([{ variantId: dell.ref, quantity: 1 }], "VANA20");
      expect(result.status).toBe("REVIEW");
      if (result.status === "REVIEW") expect(result.messages).toContain("Sooduskood: Sooduskood on aegunud.");
    });

    it("15. miinimumsumma", async () => {
      await createCode({ code: "SUUR50", type: "FIXED_AMOUNT", value: "50", minimumSubtotal: String(Math.ceil((dell.price + lenovo.price) / 100) + 100) });
      const { result } = await checkout([{ variantId: dell.ref, quantity: 1 }], "SUUR50");
      expect(result.status).toBe("REVIEW");
      if (result.status === "REVIEW") expect(result.messages[0]).toMatch(/^Sooduskood: Sooduskoodi kasutamiseks peab ostukorvi summa olema vähemalt/);
    });

    it("16. testtellimus ei kuluta päris kampaania kasutuspiirangut", async () => {
      await createCode({ code: "UKS1", type: "FIXED_AMOUNT", value: "10", usageLimit: "1" });
      const first = await checkout([{ variantId: dell.ref, quantity: 1 }], "UKS1");
      const second = await checkout([{ variantId: dell.ref, quantity: 1 }], "UKS1");
      expect([first.result.status, second.result.status]).toEqual(["CREATED", "CREATED"]);
      const [code] = await t.db.select().from(discountCodes).where(eq(discountCodes.normalizedCode, "UKS1"));
      expect(code.usageCount).toBe(0);
      expect(await t.db.select().from(discountRedemptions).where(eq(discountRedemptions.discountCodeId, code.id))).toEqual([]);
    });
  });

  describe("kinnitusleht ja avalik otsing", () => {
    it("33. kinnitusleht avaneb ainult õige juurdepääsutokeniga (numbrit muutes teisi tellimusi ei näe)", async () => {
      const { findOrderForConfirmation } = await import("./public-order");
      const { result } = await checkout([{ variantId: dell.ref, quantity: 1 }]);
      if (result.status !== "CREATED") throw new Error(result.status);
      expect(await findOrderForConfirmation(t.db, result.orderNumber, result.accessToken)).toMatchObject({ orderNumber: result.orderNumber, contact: { email: "mari@example.com" } });
      expect(await findOrderForConfirmation(t.db, result.orderNumber, null)).toBeNull();
      expect(await findOrderForConfirmation(t.db, result.orderNumber, "vale-token")).toBeNull();
      const other = await checkout([{ variantId: dell.ref, quantity: 1 }]);
      if (other.result.status !== "CREATED") throw new Error("x");
      expect(await findOrderForConfirmation(t.db, other.result.orderNumber, result.accessToken)).toBeNull();
      // Andmebaasis on ainult räsi
      expect((await orderBy(result.orderNumber)).publicAccessTokenHash).not.toBe(result.accessToken);
    });

    it("22–25. otsing: number + e-post; vale e-post ja olematu tellimus annavad sama vastuse; sisemist infot pole", async () => {
      const { lookupOrder, LOOKUP_NOT_FOUND } = await import("./public-order");
      const { result } = await checkout([{ variantId: dell.ref, quantity: 1 }]);
      if (result.status !== "CREATED") throw new Error(result.status);
      const ip = "10.200.0.1";
      const found = await lookupOrder(t.db, { orderNumber: result.orderNumber.toLowerCase(), email: " MARI@example.com", ip });
      expect(found.ok).toBe(true);
      if (found.ok) {
        expect(Object.keys(found.order).sort()).toEqual(["createdAt", "discountCents", "discountCode", "isTest", "items", "orderNumber", "paymentStatus", "shippingCents", "shippingMethodName", "status", "subtotalCents", "totalCents"]);
        expect(Object.keys(found.order.items[0]).sort()).toEqual(["cpu", "discountCents", "grade", "imagePath", "keyboard", "lineTotalCents", "quantity", "ramGb", "screen", "sku", "storageGb", "title", "unitPriceCents", "vatScheme"]);
        expect(JSON.stringify(found.order)).not.toMatch(/supplierPrice|cost|note|Hash|"id"/i);
      }
      expect(await lookupOrder(t.db, { orderNumber: result.orderNumber, email: "keegi@example.com", ip })).toEqual({ ok: false, message: LOOKUP_NOT_FOUND });
      expect(await lookupOrder(t.db, { orderNumber: "SL-26-ZZZZZZ", email: "mari@example.com", ip })).toEqual({ ok: false, message: LOOKUP_NOT_FOUND });
    });

    it("35. otsingu piirang: 10 ebaõnnestunud katset → blokeeritud ka õigete andmetega", async () => {
      const { lookupOrder, LOOKUP_RATE_LIMITED } = await import("./public-order");
      const [any] = await t.db.select().from(orders).limit(1);
      const ip = "10.250.0.9";
      for (let i = 0; i < 10; i++) await lookupOrder(t.db, { orderNumber: "SL-26-AAAAAA", email: `x${i}@example.com`, ip });
      expect(await lookupOrder(t.db, { orderNumber: any.orderNumber, email: any.customerEmail, ip })).toEqual({ ok: false, message: LOOKUP_RATE_LIMITED });
      expect((await lookupOrder(t.db, { orderNumber: any.orderNumber, email: any.customerEmail, ip: "10.250.0.10" })).ok).toBe(true);
    });
  });

  describe("server action ja turvalisus", () => {
    it("34. tellimuse esitamine teiselt saidilt (CSRF) lükatakse tagasi", async () => {
      const { placeOrderAction } = await import("@/server/checkout/checkout-actions");
      state.sameOrigin = false;
      const before = (await t.db.select().from(orders)).length;
      const result = await placeOrderAction({ checkoutAttemptId: crypto.randomUUID(), items: [{ variantId: dell.ref, quantity: 1 }], couponCode: null, form, acknowledged: { lines: [], totalCents: 0, discountCents: 0 } });
      expect(result).toMatchObject({ ok: false, kind: "ERROR" });
      expect((await t.db.select().from(orders)).length).toBe(before);
    });

    it("7. kliendi saadetud hinnad/summad ignoreeritakse; edu korral pannakse juurdepääsuküpsis", async () => {
      const { placeOrderAction, getCheckoutQuoteAction } = await import("@/server/checkout/checkout-actions");
      const items = [{ variantId: dell.ref, quantity: 1, priceCents: 1, unitPriceCents: 1 }];
      const quote = (await getCheckoutQuoteAction(items, null))!;
      const result = await placeOrderAction({
        checkoutAttemptId: crypto.randomUUID(),
        items,
        couponCode: null,
        form: { ...form, totalCents: 1, acceptTerms: true },
        acknowledged: { lines: quote.lines.map((l) => ({ variantId: l.variantId, unitPriceCents: l.unitPriceCents })), totalCents: quote.totalCents, discountCents: 0 },
      });
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect((await orderBy(result.orderNumber)).subtotalCents).toBe(dell.price);
      expect(state.cookies.get(`order_access_${result.orderNumber}`)).toBeTruthy();
    });

    it("valideerimisvead tagastatakse väljade kaupa, tellimust ei looda", async () => {
      const { placeOrderAction } = await import("@/server/checkout/checkout-actions");
      const result = await placeOrderAction({ checkoutAttemptId: crypto.randomUUID(), items: [{ variantId: dell.ref, quantity: 1 }], couponCode: null, form: { ...form, acceptTerms: true, email: "vale", postalCode: "1" }, acknowledged: { lines: [], totalCents: 0, discountCents: 0 } });
      expect(result).toMatchObject({ ok: false, kind: "VALIDATION", fieldErrors: { email: expect.any(String), postalCode: expect.any(String) } });
    });
  });

  describe("admin", () => {
    it("26. ilma sessioonita tellimusi ei näe ega muuda", async () => {
      const { listOrders, getOrderDetail } = await import("@/server/admin/orders/queries");
      const { cancelOrderAction } = await import("@/server/admin/orders/actions");
      const saved = state.admin;
      state.admin = null;
      try {
        await expect(listOrders({ page: 1 })).rejects.toThrow();
        const [any] = await t.db.select().from(orders).limit(1);
        await expect(getOrderDetail(any.id)).rejects.toThrow();
        expect(await cancelOrderAction(any.id, "")).toEqual({ ok: false, error: "Sessioon on aegunud. Logi uuesti sisse." });
      } finally {
        state.admin = saved;
      }
    });

    it("27/28. nimekiri (otsing, filtrid) ja detail", async () => {
      const { listOrders, getOrderDetail } = await import("@/server/admin/orders/queries");
      const all = await listOrders({ page: 1 });
      expect(all.total).toBeGreaterThan(5);
      expect(all.rows.every((r) => r.isTest)).toBe(true);
      expect((await listOrders({ page: 1, kind: "real" })).total).toBe(0);
      expect((await listOrders({ page: 1, coupon: "yes" })).rows.every((r) => r.discountCode)).toBe(true);
      const one = all.rows[0];
      // Tooteid = ridade koguste summa (regressioon: alampäring andis varem 0)
      const [{ n }] = await t.db.select({ n: sql<number>`sum(${orderItems.quantity})::int` }).from(orderItems).where(eq(orderItems.orderId, one.id));
      expect(one.itemCount).toBe(n);
      expect(one.itemCount).toBeGreaterThan(0);
      expect((await listOrders({ page: 1, q: one.orderNumber })).rows.map((r) => r.id)).toEqual([one.id]);
      expect((await listOrders({ page: 1, q: "mari@example" })).total).toBe(all.total);
      const detail = await getOrderDetail(one.id);
      expect(detail?.items.length).toBeGreaterThan(0);
      expect(detail?.history.length).toBe(2);
    });

    it("29/31/32. tühistamine: olek, cancelledAt, ajalugu, audit; teist korda ei saa", async () => {
      const { cancelOrderAction } = await import("@/server/admin/orders/actions");
      const { result } = await checkout([{ variantId: dell.ref, quantity: 1 }]);
      if (result.status !== "CREATED") throw new Error(result.status);
      const order = await orderBy(result.orderNumber);
      expect((await cancelOrderAction(order.id, "Klient loobus")).ok).toBe(true);
      const after = await orderBy(result.orderNumber);
      expect(after.status).toBe("CANCELLED");
      expect(after.cancelledAt).toBeInstanceOf(Date);
      const history = await t.db.select().from(orderStatusHistory).where(eq(orderStatusHistory.orderId, order.id));
      expect(history.at(-1)).toMatchObject({ fromStatus: "CREATED", toStatus: "CANCELLED", source: "ADMIN", adminEmail: "admin@example.com", note: "Klient loobus" });
      const [audit] = await t.db.select().from(auditLogs).where(and(eq(auditLogs.entityId, order.id), eq(auditLogs.action, "order.cancel")));
      expect(audit.changes).toMatchObject({ status: { from: "CREATED", to: "CANCELLED" } });
      expect((await cancelOrderAction(order.id, "")).ok).toBe(false);
    });

    it("30. sisemärkus salvestub, auditisse ei kopeerita teksti, kliendi otsingus ei näidata", async () => {
      const { addOrderNoteAction } = await import("@/server/admin/orders/actions");
      const { lookupOrder } = await import("./public-order");
      const [order] = await t.db.select().from(orders).limit(1);
      expect((await addOrderNoteAction(order.id, null, fd({ note: "Klient helistas. Salajane info." }))).ok).toBe(true);
      expect((await addOrderNoteAction(order.id, null, fd({ note: "   " }))).ok).toBe(false);
      const notes = await t.db.select().from(orderInternalNotes).where(eq(orderInternalNotes.orderId, order.id));
      expect(notes).toEqual([expect.objectContaining({ note: "Klient helistas. Salajane info.", adminEmail: "admin@example.com" })]);
      const [audit] = await t.db.select().from(auditLogs).where(and(eq(auditLogs.entityId, order.id), eq(auditLogs.action, "order.note_added")));
      expect(JSON.stringify(audit.changes)).not.toContain("Salajane");
      const view = await lookupOrder(t.db, { orderNumber: order.orderNumber, email: order.customerEmail, ip: "10.77.0.1" });
      expect(JSON.stringify(view)).not.toContain("Salajane");
    });
  });
});

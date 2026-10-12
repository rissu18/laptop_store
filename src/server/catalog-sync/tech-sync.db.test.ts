import { and, count, eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { createTestDatabase, hasTestDatabase, type TestDatabase } from "@/test/test-db";
import {
  catalogSyncRuns,
  listingImages,
  orderItemUnits,
  orderItems,
  orders,
  productModels,
  productImages,
  supplierInventoryUnits,
  supplierListings,
} from "@/server/db/schema";
import { RED, techRow, techSheet, type TechFixtureEntry } from "@/integrations/tech/tech-fixtures";
import type { SheetData } from "@/integrations/tech/tech-sheet";

/**
 * Tech hinnakirja sync päris PostgreSQL-is (ajutine skeem test_xxxx — poe andmeid ei puututa).
 * Google Sheet on asendatud fiktiivsete testandmetega (seerianumbrid TESTSN…) — päris lehte ei muudeta.
 */

const state = vi.hoisted(() => ({ db: null as unknown }));

vi.mock("next/cache", () => ({ updateTag: () => {}, revalidateTag: () => {}, cacheTag: () => {}, cacheLife: () => {}, refresh: () => {} }));
vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => undefined, set: () => {} }), headers: async () => new Headers() }));
vi.mock("@/server/db/client", async (importOriginal) => ({ ...(await importOriginal<object>()), getDb: () => state.db, isDatabaseConfigured: () => true }));
vi.mock("@/server/logging/system-log", () => ({ writeSystemLog: async () => {}, newErrorId: () => "TESTID", errorMessage: (e: unknown) => String(e) }));
vi.mock("@/server/auth/auth", () => ({ getClientMeta: async () => ({ ip: "10.9.9.8", userAgent: "vitest" }) }));

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

/** Põhiseis: 4 × T14 Gen 3 (sama konfiguratsioon) + variandid + välja jäetavad read */
function baseRows() {
  return {
    t14: ["7100001", "7100002", "7100003", "7100004"].map((id, i) => techRow({ id, serial: `TESTSN-T14-${i + 1}` })),
    backlit: techRow({ id: "7100005", serial: "TESTSN-BL", k: "bl id" }),
    sold: techRow({ id: "7100006", serial: "TESTSN-SOLD", brandFill: RED }),
    defect: techRow({ id: "7100007", serial: "TESTSN-DEAD", l: "dead battery" }),
    unknown: techRow({ id: "7100008", serial: "TESTSN-UNK", k: "safety" }),
    acer: techRow({ id: "7100009", serial: "TESTSN-ACER", brand: "Acer", model: "Aspire V3-772G", cpu: "i7-4702MQ", ram: "8192", storage: "256 SSD", display: 'W17"', resolution: "1920x1080", gpu: "Nvidia GeForce GTX 760M", price: "220" }),
    tablet: techRow({ id: "7100010", serial: "TESTSN-TAB", brand: "Microsoft", model: "Surface Pro 5", display: 'W12"', l: "no keyboard" }),
    incoming: techRow({ id: "7100011", serial: "TESTSN-HP", brand: "HP", model: "EliteBook 840 G9", cpu: "i5-1245U", price: "420" }),
  };
}

type Rows = ReturnType<typeof baseRows>;

function workbook(rows: Rows, options: { noFills?: boolean } = {}): SheetData[] {
  const used: TechFixtureEntry[] = [...rows.t14, rows.backlit, rows.sold, rows.defect, rows.unknown, rows.acer, rows.tablet].filter(Boolean);
  return [
    techSheet("Used Laptops ", used, options),
    techSheet("Incoming 1 07.10", [{ heading: "Monitors" }, techRow({ id: "7199999", serial: "TESTSN-MON", brand: "Dell", model: "P2419H", display: 'W24"' }), { heading: "Laptops" }, rows.incoming], options),
    techSheet("Monitors", [techRow({ id: "7199998", serial: "TESTSN-MON2", brand: "Dell", model: "P2419H" })], options),
  ];
}

const T14_GROUP_COUNT = 4;

describe.skipIf(!hasTestDatabase)("Tech hinnakirja sync (andmebaas)", () => {
  let t: TestDatabase;
  let rows: Rows;

  const sync = async (sheets: SheetData[] | (() => Promise<SheetData[]>), options: { allowLargeDrop?: boolean } = {}) => {
    const { runTechSync } = await import("./tech-sync");
    return runTechSync(t.db, {
      trigger: "TEST",
      allowLargeDrop: options.allowLargeDrop,
      loadSheets: typeof sheets === "function" ? sheets : async () => sheets,
      log: async () => {},
    });
  };
  const ok = async (sheets: SheetData[], options: { allowLargeDrop?: boolean } = {}) => {
    const result = await sync(sheets, options);
    if (result.status !== "SUCCESS") throw new Error(`${result.status}: ${"error" in result ? result.error : ""}`);
    return result;
  };
  const unit = async (externalUnitId: string) => (await t.db.select().from(supplierInventoryUnits).where(and(eq(supplierInventoryUnits.supplier, "tech"), eq(supplierInventoryUnits.externalUnitId, externalUnitId))))[0];
  const listingOf = async (externalUnitId: string) => {
    const u = await unit(externalUnitId);
    return (await t.db.select().from(supplierListings).where(eq(supplierListings.id, u.supplierListingId!)))[0];
  };
  const catalogItems = async () => {
    const { mapCatalogRows } = await import("@/server/catalog/db-catalog-mapper");
    const [models, listings, images, unitImages] = await Promise.all([
      t.db.select().from(productModels),
      t.db.select().from(supplierListings),
      t.db.select().from(productImages),
      t.db.select().from(listingImages),
    ]);
    return mapCatalogRows(models, listings, images, unitImages).items;
  };
  const techItem = async (externalUnitId: string) => {
    const l = await listingOf(externalUnitId);
    return (await catalogItems()).find((i) => i.variant.id === `tech-${l.supplierProductId}`);
  };

  beforeAll(async () => {
    t = await createTestDatabase();
    state.db = t.db;
    // Olemasolev kataloog (mock: mudelid + Icecati pildid) — Tech peab sellega kokku minema
    const { seedCatalog } = await import("@/server/db/seed/seed-catalog");
    const { loadSeedSources } = await import("@/server/db/seed/seed-sources");
    await seedCatalog(t.db, (await loadSeedSources()).sources);
    rows = baseRows();
  }, 120_000);
  afterAll(async () => {
    await t?.cleanup();
  });

  it("esimene sync: grupid, täpne laoseis, Grade B, hind M+60 / ostuhind M−20, tarne 1–2, KM erikord", async () => {
    const mockBefore = await t.db.select().from(supplierListings).where(eq(supplierListings.supplier, "mock"));
    const result = await ok(workbook(rows));
    expect(result.snapshotTrusted).toBe(true);
    expect(result.stats).toMatchObject({
      laptopRows: 11,
      soldRows: 1,
      notLaptopRows: 1,
      defectRows: 1,
      unknownNoteRows: 1,
      validUnits: 7,
      groups: 4,
      created: 4,
      unitsCreated: 11,
      conflicts: 0,
    });

    const listing = await listingOf("7100001");
    expect(listing).toMatchObject({
      supplier: "tech",
      grade: "B",
      stock: T14_GROUP_COUNT,
      available: true,
      supplierPriceCents: 36_000,
      salePriceCents: 44_000,
      priceSource: "SUPPLIER",
      vatScheme: "MARGIN",
      deliveryMinDays: 1,
      deliveryMaxDays: 2,
      warrantyMonths: null,
      chargerIncluded: true,
      cpu: "Intel Core i5-1235U",
      ramGb: 16,
      storageGb: 256,
      status: "ACTIVE",
      manualOverrides: {},
    });
    expect(listing.sku).toMatch(/^TC-/);
    expect(listing.details).toMatchObject({ source: "TECH", sourcePriceCents: 38_000 });
    // 4 müügis seadet ühe pakkumise all; sama konfiguratsiooni müüdud/defekt/tundmatu jäävad seotuks (ajalugu adminis), laoseisu ei loe
    const units = await t.db.select().from(supplierInventoryUnits).where(eq(supplierInventoryUnits.supplierListingId, listing.id));
    expect(units.filter((u) => u.available).map((u) => u.externalUnitId).sort()).toEqual(["7100001", "7100002", "7100003", "7100004"]);
    expect(units.filter((u) => !u.available).map((u) => [u.externalUnitId, u.status]).sort()).toEqual([["7100006", "SOLD"], ["7100007", "DEFECT"], ["7100008", "UNKNOWN_NOTE"]]);
    // bl id → eraldi pakkumine
    expect((await listingOf("7100005")).id).not.toBe(listing.id);
    expect((await listingOf("7100005")).features).toMatchObject({ backlit: true, smartcard: true });
    // Välja jäetud seadmed on ajaloos alles, aga mitte müügis
    expect(await unit("7100006")).toMatchObject({ available: false, status: "SOLD", soldByColor: true });
    expect(await unit("7100007")).toMatchObject({ available: false, status: "DEFECT" });
    expect(await unit("7100008")).toMatchObject({ available: false, status: "UNKNOWN_NOTE" });
    expect(await unit("7100010")).toMatchObject({ available: false, status: "NOT_LAPTOP" });
    // Monitor (Incoming → Monitors sektsioon, Monitors tab) ei jõua andmebaasi
    expect(await unit("7199999")).toBeUndefined();
    expect(await unit("7199998")).toBeUndefined();
    // Mock-kataloogi ei puudutatud
    const mockAfter = await t.db.select().from(supplierListings).where(eq(supplierListings.supplier, "mock"));
    expect(mockAfter.map((r) => [r.id, r.updatedAt.getTime(), r.stock])).toEqual(mockBefore.map((r) => [r.id, r.updatedAt.getTime(), r.stock]));
    const [run] = await t.db.select().from(catalogSyncRuns).where(eq(catalogSyncRuns.id, result.runId));
    expect(run).toMatchObject({ source: "TECH", status: "SUCCESS", snapshotTrusted: true });
  });

  it("olemasolev ProductModel taaskasutatakse (T14 Gen 3 = mock-mudel); uus mudel ilma rikastuseta → NULL väärtused", async () => {
    const [mockModel] = await t.db.select().from(productModels).where(eq(productModels.slug, "lenovo-thinkpad-t14-gen-3"));
    expect(mockModel).toBeTruthy();
    expect((await listingOf("7100001")).productModelId).toBe(mockModel.id);
    const [{ n }] = await t.db.select({ n: count() }).from(productModels).where(eq(productModels.slug, "lenovo-thinkpad-t14-gen-3"));
    expect(n).toBe(1);
    const [acer] = await t.db.select().from(productModels).where(eq(productModels.slug, "acer-aspire-v3-772g"));
    expect(acer).toMatchObject({ manufacturer: "acer", weightKg: null, usbAPorts: null, usbCPorts: null, wifi: null, bluetooth: null, screenSizeIn: 17 });
  });

  it("pood: Tech pakkumine kataloogis — täpne laoseis, tarne 1–2 tööpäeva, Grade B, hind 440 €; mudeli andmed olemasolevast mudelist", async () => {
    const item = (await techItem("7100001"))!;
    expect(item.variant).toMatchObject({ grade: "B", stock: { available: true, quantity: T14_GROUP_COUNT }, delivery: { minDays: 1, maxDays: 2 }, price: { saleCents: 44_000, vatScheme: "MARGIN" } });
    expect(item.product.slug).toBe("lenovo-thinkpad-t14-gen-3");
    expect(item.product.title).toBe("Lenovo ThinkPad T14 G3");
    // Tech konfiguratsioon jääb Techi omaks (mudeli rikastus ei kirjuta üle)
    expect(item.variant.cpu.model).toBe("Intel Core i5-1235U");
    expect(item.variant.ramGb).toBe(16);
    // Defekt/müüdud/tundmatu/tahvel ei ole poes
    const ids = (await catalogItems()).map((i) => i.variant.id);
    const { stockLabel } = await import("@/domain/catalog/availability");
    expect(stockLabel(item.variant.stock)).toBe(`Partnerlaos ${T14_GROUP_COUNT} tk`);
    expect(ids.filter((id) => id.startsWith("tech-"))).toHaveLength(4);
  });

  it("rikastus puudub → pakkumine ikka poes, mudeli pildid tühjad (illustratsioon); teise tarnija pildid samal mudelil → varupildid", async () => {
    const acerItem = (await techItem("7100009"))!;
    expect(acerItem).toBeTruthy();
    expect(acerItem.product.images).toEqual([]);
    expect(acerItem.product.weightKg).toBeNull();
    // Sama mudeli teine tarnija (nt Laptopid.ee) fotodega → Techi pakkumine näeb neid illustratiivsete mudelipiltidena
    const [acerModel] = await t.db.select().from(productModels).where(eq(productModels.slug, "acer-aspire-v3-772g"));
    const [other] = await t.db
      .insert(supplierListings)
      .values({ productModelId: acerModel.id, supplier: "laptopid", supplierProductId: "990001", sku: "LP-990001", cpu: "Intel Core i5-4200M", ramGb: 8, storageGb: 256, grade: "A", salePriceCents: 25_900, priceSource: "SUPPLIER", available: true, screenSizeIn: 17 })
      .returning();
    await t.db.insert(listingImages).values({ supplierListingId: other.id, source: "LAPTOPID", sourceId: "1", position: 0, thumbnailUrl: "https://laptopid.ee/images/product/990001/1/small.png", mediumUrl: "https://laptopid.ee/images/product/990001/1/medium.png", largeUrl: "https://laptopid.ee/images/product/990001/1/original.png", width: 800, height: 600, alt: "Acer" });
    const withSibling = (await techItem("7100009"))!;
    expect(withSibling.variant.images).toEqual([]);
    expect(withSibling.product.images.map((i) => [i.largeUrl, i.type])).toEqual([["https://laptopid.ee/images/product/990001/1/original.png", "MODEL_GENERIC"]]);
    expect(withSibling.variant.ramGb).toBe(8);
    expect(withSibling.variant.cpu.model).toBe("Intel Core i7-4702MQ");
  });

  it("teine identne sync: duplikaate ei teki, midagi ei muutu peale lastSeenAt", async () => {
    const before = await t.db.select().from(supplierListings).where(eq(supplierListings.supplier, "tech"));
    const result = await ok(workbook(rows));
    expect(result.stats).toMatchObject({ created: 0, updated: 0, unchanged: 4, madeUnavailable: 0, unitsCreated: 0, unitsUpdated: 0, unitsUnchanged: 11, modelsCreated: 0 });
    expect(result.changed).toBe(false);
    const after = await t.db.select().from(supplierListings).where(eq(supplierListings.supplier, "tech"));
    expect(after.map((r) => r.id).sort()).toEqual(before.map((r) => r.id).sort());
    const dupes = await t.db.execute(sql`SELECT external_unit_id FROM supplier_inventory_units GROUP BY supplier, external_unit_id HAVING count(*) > 1`);
    expect(dupes.rows).toHaveLength(0);
    const listingDupes = await t.db.execute(sql`SELECT supplier_product_id FROM supplier_listings GROUP BY supplier, supplier_product_id HAVING count(*) > 1`);
    expect(listingDupes.rows).toHaveLength(0);
  });

  it("müük: Brand/Model värvitakse → laoseis −1; viimane müüdud → pakkumine poest väljas (ei kustutata); värv eemaldatud → taastub", async () => {
    const colored = baseRows();
    colored.t14[0] = { ...rows.t14[0], brandFill: RED };
    const one = await ok(workbook(colored));
    expect(one.stats).toMatchObject({ unitsMadeUnavailable: 1, updated: 1 });
    expect(await unit("7100001")).toMatchObject({ available: false, status: "SOLD", soldByColor: true });
    expect((await listingOf("7100002")).stock).toBe(3);
    expect((await techItem("7100002"))!.variant.stock).toEqual({ available: true, quantity: 3 });

    const allSold = baseRows();
    allSold.t14 = rows.t14.map((r) => ({ ...r, modelFill: "FF999999" }));
    const all = await ok(workbook(allSold));
    expect(all.stats.madeUnavailable).toBe(1);
    const gone = await listingOf("7100002");
    expect(gone).toMatchObject({ stock: 0, available: false, status: "ACTIVE" });
    expect(await techItem("7100002")).toBeUndefined();

    await ok(workbook(rows));
    expect((await listingOf("7100002")).stock).toBe(4);
    expect(await unit("7100001")).toMatchObject({ available: true, status: "AVAILABLE" });
    expect((await techItem("7100001"))!.variant.stock.quantity).toBe(4);
  });

  it("defekt tekib hiljem → seade välja; seade kaob usaldusväärsest snapshot'ist → MISSING; tagasi tulles taastub", async () => {
    const withDefect = baseRows();
    withDefect.t14[1] = { ...rows.t14[1], l: "klava x" };
    await ok(workbook(withDefect));
    expect(await unit("7100002")).toMatchObject({ available: false, status: "DEFECT" });
    expect((await listingOf("7100001")).stock).toBe(3);

    const missing = baseRows();
    missing.t14 = [rows.t14[0], rows.t14[1], rows.t14[3]];
    const result = await ok(workbook(missing));
    expect(result.snapshotTrusted).toBe(true);
    expect(result.stats.unitsMissing).toBe(1);
    expect(await unit("7100003")).toMatchObject({ available: false, status: "MISSING" });
    expect((await listingOf("7100001")).stock).toBe(3);

    await ok(workbook(rows));
    expect(await unit("7100003")).toMatchObject({ available: true, status: "AVAILABLE" });
    expect((await listingOf("7100001")).stock).toBe(4);
  });

  it("admini hinnaparandus jääb sync'i üle alles (sync muudab ainult tarnija veerge)", async () => {
    const listing = await listingOf("7100001");
    await t.db.update(supplierListings).set({ manualOverrides: { salePriceCents: 42_900 } }).where(eq(supplierListings.id, listing.id));
    const colored = baseRows();
    colored.t14[2] = { ...rows.t14[2], brandFill: RED };
    await ok(workbook(colored));
    const after = await listingOf("7100001");
    expect(after.manualOverrides).toEqual({ salePriceCents: 42_900 });
    expect(after.salePriceCents).toBe(44_000); // tarnija väärtus
    expect((await techItem("7100001"))!.variant.price.saleCents).toBe(42_900); // kehtib admini hind
    await t.db.update(supplierListings).set({ manualOverrides: {} }).where(eq(supplierListings.id, listing.id));
    await ok(workbook(rows));
    expect((await techItem("7100001"))!.variant.price.saleCents).toBe(44_000);
  });

  it("ostukorv ja kassa: täpne laoseis 4 → kogus 1–4 lubatud, 5 → viga; Laptopid semantika eraldi", async () => {
    const id = `tech-${(await listingOf("7100001")).supplierProductId}`;
    const { resolveCart } = await import("@/server/cart/cart-actions");
    const cart = await resolveCart([{ variantId: id, quantity: 7 }]);
    expect(cart.lines[0]).toMatchObject({ quantity: 4, maxQuantity: 4, quantityUnknown: false, quantityLimited: true });
    const { computeCheckout } = await import("@/server/checkout/checkout-service");
    const four = await computeCheckout(t.db, { items: [{ variantId: id, quantity: 4 }], couponCode: null });
    expect(four.quote.issues).toEqual([]);
    expect(four.quote.lines[0]).toMatchObject({ quantity: 4, unitPriceCents: 44_000, grade: "B" });
    const five = await computeCheckout(t.db, { items: [{ variantId: id, quantity: 5 }], couponCode: null });
    expect(five.quote.lines).toHaveLength(0);
    expect(five.quote.issues[0]).toMatchObject({ kind: "INSUFFICIENT_STOCK", quantityKnown: true });
  });

  it("sooduskoodi marginaalikaitse: Tech ostuhind on teada → alampiir arvutatakse; Laptopid (ostuhind NULL) → kontrollimata", async () => {
    const { toDiscountCartLines } = await import("@/server/discounts/discount-service");
    const { pricingConfig } = await import("@/config/pricing");
    const tech = await listingOf("7100001");
    const lines = await toDiscountCartLines(
      t.db,
      [
        { sku: tech.sku, productSlug: "lenovo-thinkpad-t14-gen-3", manufacturer: "lenovo", unitPriceCents: 44_000, quantity: 1 },
        { sku: "LP-990001", productSlug: "acer-aspire-v3-772g", manufacturer: "acer", unitPriceCents: 25_900, quantity: 1 },
      ] as never,
      pricingConfig,
    );
    expect(lines[0].minimumUnitPriceCents).toBeGreaterThan(36_000);
    expect(lines[1].minimumUnitPriceCents).toBeNull();
  });

  it("tellimus: admin määrab seerianumbrid (kogus 2 → 2 seadet); testtellimus ei kuluta laoseisu; klient seerianumbrit ei näe", async () => {
    const listing = await listingOf("7100001");
    const variantId = `tech-${listing.supplierProductId}`;
    const { computeCheckout } = await import("@/server/checkout/checkout-service");
    const { placeOrder } = await import("@/server/orders/order-service");
    const items = [{ variantId, quantity: 2 }];
    const { quote } = await computeCheckout(t.db, { items, couponCode: null });
    const created = await placeOrder(t.db, {
      idempotencyKey: crypto.randomUUID(),
      items,
      couponCode: null,
      form,
      acknowledged: { lines: quote.lines.map((l) => ({ variantId: l.variantId, unitPriceCents: l.unitPriceCents })), totalCents: quote.totalCents, discountCents: 0 },
    });
    if (created.status !== "CREATED") throw new Error(created.status);
    expect(created.isTest).toBe(true);
    const [order] = await t.db.select().from(orders).where(eq(orders.orderNumber, created.orderNumber));
    const [item] = await t.db.select().from(orderItems).where(eq(orderItems.orderId, order.id));
    expect(item).toMatchObject({ supplierListingId: listing.id, quantity: 2, grade: "B", ramGb: 16, unitPriceCents: 44_000 });

    const { assignUnitToOrderItem, unassignUnitFromOrderItem, loadOrderItemUnits } = await import("@/server/orders/order-units");
    const admin = { id: crypto.randomUUID(), email: "admin@example.com" };
    const assign = (unitId: string) => t.db.transaction((tx) => assignUnitToOrderItem(tx, { orderId: order.id, orderItemId: item.id, inventoryUnitId: unitId, admin: { ...admin, id: null as unknown as string } }));
    const [u1, u2, u3, other] = await Promise.all(["7100001", "7100002", "7100003", "7100005"].map(unit));
    expect(await assign(u1.id)).toMatchObject({ ok: true, externalUnitId: "7100001" });
    expect(await assign(u1.id)).toMatchObject({ ok: false });
    expect(await assign(other.id)).toMatchObject({ ok: false, error: expect.stringMatching(/konfiguratsiooni/) });
    expect(await assign(u2.id)).toMatchObject({ ok: true });
    expect(await assign(u3.id)).toMatchObject({ ok: false, error: expect.stringMatching(/kogus 2/) });
    const assigned = (await loadOrderItemUnits(t.db, [item.id])).get(item.id)!;
    expect(assigned.map((a) => a.serialNumber).sort()).toEqual(["TESTSN-T14-1", "TESTSN-T14-2"]);

    // Testtellimus: seadmed jäävad müüki, laoseis ei muutu; sync ei puutu määranguid
    expect((await listingOf("7100001")).stock).toBe(4);
    await ok(workbook(rows));
    expect(await t.db.select().from(orderItemUnits).where(eq(orderItemUnits.orderItemId, item.id))).toHaveLength(2);

    // Klient (kinnitusleht) seerianumbrit ei näe
    const { findOrderForConfirmation } = await import("@/server/orders/public-order");
    const view = await findOrderForConfirmation(t.db, created.orderNumber, created.accessToken);
    expect(view).toBeTruthy();
    expect(JSON.stringify(view)).not.toMatch(/TESTSN|7100001/);

    expect(await t.db.transaction((tx) => unassignUnitFromOrderItem(tx, { orderId: order.id, assignmentId: assigned[0].assignmentId }))).toMatchObject({ ok: true });
    expect(await t.db.select().from(orderItemUnits).where(eq(orderItemUnits.orderItemId, item.id))).toHaveLength(1);
  });

  it("seerianumber ei leki: poe kataloog, otsing, ostukorv ega kassa ei sisalda seerianumbreid ega Tech ID-sid", async () => {
    const items = await catalogItems();
    const json = JSON.stringify(items);
    expect(json).not.toMatch(/TESTSN/);
    expect(json).not.toMatch(/7100001/);
    const { searchSuggestions } = await import("@/server/catalog/catalog-service");
    expect(JSON.stringify(await searchSuggestions("t14", 10))).not.toMatch(/TESTSN/);
    const id = `tech-${(await listingOf("7100001")).supplierProductId}`;
    const { resolveCart } = await import("@/server/cart/cart-actions");
    expect(JSON.stringify(await resolveCart([{ variantId: id, quantity: 1 }]))).not.toMatch(/TESTSN|7100001/);
    const { computeCheckout } = await import("@/server/checkout/checkout-service");
    expect(JSON.stringify((await computeCheckout(t.db, { items: [{ variantId: id, quantity: 1 }], couponCode: null })).quote)).not.toMatch(/TESTSN|7100001/);
    // Pakkumise toorandmetes seerianumbreid pole (seerianumbrid on ainult seadmete tabelis)
    const listings = await t.db.select().from(supplierListings).where(eq(supplierListings.supplier, "tech"));
    expect(JSON.stringify(listings)).not.toMatch(/TESTSN/);
  });

  it("stiiliinfo puudub (CSV-laadne) / allikas maas → FAILED, kataloog ja seadmed jäävad samaks", async () => {
    const before = await t.db.select().from(supplierListings).where(eq(supplierListings.supplier, "tech"));
    const unitsBefore = await t.db.select().from(supplierInventoryUnits).where(eq(supplierInventoryUnits.supplier, "tech"));
    const noFills = await sync(workbook(rows, { noFills: true }));
    expect(noFills.status).toBe("FAILED");
    if (noFills.status === "FAILED") expect(noFills.error).toMatch(/NO_STYLE_INFO/);
    const down = await sync(async () => {
      throw new Error("Google Sheets eksport: HTTP 500");
    });
    expect(down.status).toBe("FAILED");
    const after = await t.db.select().from(supplierListings).where(eq(supplierListings.supplier, "tech"));
    expect(after.map((r) => [r.id, r.stock, r.available])).toEqual(before.map((r) => [r.id, r.stock, r.available]));
    const unitsAfter = await t.db.select().from(supplierInventoryUnits).where(eq(supplierInventoryUnits.supplier, "tech"));
    expect(unitsAfter.map((u) => [u.id, u.available, u.status])).toEqual(unitsBefore.map((u) => [u.id, u.available, u.status]));
  });

  it("lukk: Tech sync ei jookse iseendaga topelt (BUSY); Laptopid lukk on eraldi", async () => {
    const [running] = await t.db.insert(catalogSyncRuns).values({ source: "TECH", status: "RUNNING", trigger: "TEST", leaseUntil: new Date(Date.now() + 60_000) }).returning();
    const [laptopid] = await t.db.insert(catalogSyncRuns).values({ source: "LAPTOPID", status: "RUNNING", trigger: "TEST", leaseUntil: new Date(Date.now() + 60_000) }).returning();
    expect((await sync(workbook(rows))).status).toBe("BUSY");
    await t.db.update(catalogSyncRuns).set({ status: "FAILED" }).where(eq(catalogSyncRuns.id, running.id));
    expect((await sync(workbook(rows))).status).toBe("SUCCESS"); // Laptopid RUNNING ei blokeeri Techi
    await t.db.update(catalogSyncRuns).set({ status: "FAILED" }).where(eq(catalogSyncRuns.id, laptopid.id));
  });
});

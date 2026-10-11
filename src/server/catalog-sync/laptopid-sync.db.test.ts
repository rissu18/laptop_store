import { and, count, eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { createTestDatabase, hasTestDatabase, type TestDatabase } from "@/test/test-db";
import { catalogSyncRuns, discountCodes, listingImages, orderItems, orders, productImages, productModels, supplierListings } from "@/server/db/schema";
import { laptopidImages, laptopidProduct, laptopidSnapshot } from "@/integrations/laptopid/laptopid-fixtures";
import { UNKNOWN_QUANTITY_LIMIT_MESSAGE } from "@/domain/catalog/availability";

/**
 * Laptopid.ee sync päris PostgreSQL-is (ajutine skeem test_xxxx — poe andmeid ei puututa).
 * API on asendatud testandmetega (päris vastuse kujul), pildi mõõtude lugemine võltsitud.
 */

const state = vi.hoisted(() => ({ db: null as unknown }));

vi.mock("next/cache", () => ({ updateTag: () => {}, revalidateTag: () => {}, cacheTag: () => {}, cacheLife: () => {}, refresh: () => {} }));
vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => undefined, set: () => {} }), headers: async () => new Headers() }));
vi.mock("@/server/db/client", async (importOriginal) => ({ ...(await importOriginal<object>()), getDb: () => state.db, isDatabaseConfigured: () => true }));
vi.mock("@/server/logging/system-log", () => ({ writeSystemLog: async () => {}, newErrorId: () => "TESTID", errorMessage: (e: unknown) => String(e) }));
vi.mock("@/server/auth/auth", () => ({ getClientMeta: async () => ({ ip: "10.9.9.9", userAgent: "vitest" }) }));

type Payload = { products: unknown; images: unknown };

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

/** 20 lisatoodet, et "suure kao" piir (max(10, 25%)) oleks testitav */
const extraProducts = Array.from({ length: 20 }, (_, i) =>
  laptopidProduct({ id: 7000 + i, model: "Latitude 5430 ", manufacturer: "Dell", screen: '14" FHD (1920x1080) IPS matt', sale_price: `${500 + i}.00`, slug: `dell-latitude-5430-${i}` }),
);

function basePayload(): Payload {
  const { products, images } = laptopidSnapshot();
  return { products: [...products, ...extraProducts], images };
}

describe.skipIf(!hasTestDatabase)("Laptopid.ee sync (andmebaas)", () => {
  let t: TestDatabase;
  const logs: { level: string; message: string }[] = [];
  let probeCalls = 0;

  const sync = async (payload: Payload | (() => Promise<Payload>), options: { allowLargeDrop?: boolean } = {}) => {
    const { runLaptopidSync } = await import("./laptopid-sync");
    return runLaptopidSync(t.db, {
      trigger: "TEST",
      allowLargeDrop: options.allowLargeDrop,
      fetchRaw: typeof payload === "function" ? payload : async () => payload,
      probeImage: async () => {
        probeCalls++;
        return { width: 800, height: 600 };
      },
      log: async (entry) => {
        logs.push(entry);
      },
    });
  };
  const listing = async (externalId: string) =>
    (await t.db.select().from(supplierListings).where(and(eq(supplierListings.supplier, "laptopid"), eq(supplierListings.supplierProductId, externalId))))[0];
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

  beforeAll(async () => {
    t = await createTestDatabase();
    state.db = t.db;
    // Olemasolev mock-kataloog (mudelid, Icecati pildid) — Laptopid peab sellega korrektselt kokku minema
    const { seedCatalog } = await import("@/server/db/seed/seed-catalog");
    const { loadSeedSources } = await import("@/server/db/seed/seed-sources");
    await seedCatalog(t.db, (await loadSeedSources()).sources);
  }, 120_000);
  afterAll(async () => {
    await t?.cleanup();
  });

  it("esimene sync loob pakkumised: allikas + externalId, tarnija hind, cost NULL, saadaval + kogus teadmata", async () => {
    const result = await sync(basePayload());
    expect(result.status).toBe("SUCCESS");
    if (result.status !== "SUCCESS") return;
    expect(result.stats).toMatchObject({ received: 28, valid: 28, rejected: 0, created: 28, updated: 0, madeUnavailable: 0, taxonomyWarnings: 0 });
    expect(result.rejected).toEqual([]);

    const row = await listing("6678");
    expect(row).toMatchObject({
      sku: "LP-6678",
      supplierSku: "6678",
      available: true,
      stock: null,
      supplierPriceCents: null,
      salePriceCents: 74_900,
      referencePriceCents: null,
      priceSource: "SUPPLIER",
      status: "ACTIVE",
      cpu: "Intel Core i5-1235U",
      ramGb: 16,
      storageGb: 256,
      grade: "A",
    });
    expect(row.details).toMatchObject({ source: "LAPTOPID", usbA: 2, usbC: 2, newPriceCents: 279_900 });
    expect(row.lastSeenAt).toBeInstanceOf(Date);
    const images = await t.db.select().from(listingImages).where(eq(listingImages.supplierListingId, row.id));
    expect(images.map((i) => [i.position, i.thumbnailUrl])).toEqual([
      [0, "https://laptopid.ee/images/product/6678/30530/small.png"],
      [1, "https://laptopid.ee/images/product/6678/30531/small.png"],
    ]);
    const [run] = await t.db.select().from(catalogSyncRuns).where(eq(catalogSyncRuns.id, result.runId));
    expect(run).toMatchObject({ status: "SUCCESS", source: "LAPTOPID", snapshotTrusted: true });
  });

  it("sama mudeli konfiguratsioonid jäävad eraldi pakkumisteks ühe mudeli all; uus mudel luuakse, kui vastet pole", async () => {
    const rows = await Promise.all(["6678", "6675", "6602"].map(listing));
    expect(new Set(rows.map((r) => r.id)).size).toBe(3);
    expect(new Set(rows.map((r) => r.productModelId)).size).toBe(1);
    const [model] = await t.db.select().from(productModels).where(eq(productModels.id, rows[0].productModelId));
    expect(model).toMatchObject({ slug: "lenovo-thinkpad-x1-carbon-gen-10", manufacturer: "lenovo", family: "ThinkPad", model: "X1 Carbon Gen 10", wifi: null, bluetooth: null, usbAPorts: 2, usbCPorts: 2 });
  });

  it("olemasolev mudel leitakse kanoonilise nime järgi (Laptopid 'Latitude 5430' = mock 'Latitude 5430')", async () => {
    const [mockModel] = await t.db.select().from(productModels).where(eq(productModels.slug, "dell-latitude-5430"));
    expect(mockModel).toBeTruthy();
    expect((await listing("7000")).productModelId).toBe(mockModel.id);
  });

  it("teine identne sync: duplikaate ei teki, midagi ei muutu peale lastSeenAt", async () => {
    const before = await listing("6678");
    const probesBefore = probeCalls;
    const result = await sync(basePayload());
    if (result.status !== "SUCCESS") throw new Error(result.status);
    expect(result.stats).toMatchObject({ created: 0, updated: 0, unchanged: 28, madeUnavailable: 0, modelsCreated: 0, modelsUpdated: 0, imagesAdded: 0 });
    expect(result.changed).toBe(false);
    expect(probeCalls).toBe(probesBefore);
    const [{ n }] = await t.db.select({ n: count() }).from(supplierListings).where(eq(supplierListings.supplier, "laptopid"));
    expect(n).toBe(28);
    const dupes = await t.db.execute(sql`SELECT supplier_product_id FROM supplier_listings GROUP BY supplier, supplier_product_id HAVING count(*) > 1`);
    expect(dupes.rows).toHaveLength(0);
    const after = await listing("6678");
    expect(after.id).toBe(before.id);
    expect(after.lastSeenAt!.getTime()).toBeGreaterThanOrEqual(before.lastSeenAt!.getTime());
  });

  it("muutunud hind uuendab sama pakkumist; admini hinnaparandus jääb alles kuni Taasta", async () => {
    const row = await listing("6678");
    await t.db.update(supplierListings).set({ manualOverrides: { salePriceCents: 51_900 } }).where(eq(supplierListings.id, row.id));
    const payload = basePayload();
    (payload.products as Record<string, unknown>[])[0] = laptopidProduct({ sale_price: "549.00" });
    const result = await sync(payload);
    if (result.status !== "SUCCESS") throw new Error(result.status);
    expect(result.stats.updated).toBe(1);
    const after = await listing("6678");
    expect(after.id).toBe(row.id);
    expect(after.salePriceCents).toBe(54_900); // tarnija väärtus
    expect(after.manualOverrides).toEqual({ salePriceCents: 51_900 }); // parandus alles
    const item = (await catalogItems()).find((i) => i.variant.id === "laptopid-6678")!;
    expect(item.variant.price.saleCents).toBe(51_900); // kehtib admini hind
    // "Taasta tarnija väärtus"
    await t.db.update(supplierListings).set({ manualOverrides: {} }).where(eq(supplierListings.id, row.id));
    expect((await catalogItems()).find((i) => i.variant.id === "laptopid-6678")!.variant.price.saleCents).toBe(54_900);
  });

  it("poe kataloog ja otsing näevad uusi pakkumisi; laoseis 'saadaval, kogus teadmata'; pakkumise pildid", async () => {
    const { filterItems } = await import("@/domain/catalog/filtering");
    const { emptyQuery } = await import("@/domain/catalog/query");
    const items = await catalogItems();
    const item = items.find((i) => i.variant.id === "laptopid-6678")!;
    expect(item.product.title).toBe("Lenovo ThinkPad X1 Carbon G10");
    expect(item.product.slug).toBe("lenovo-thinkpad-x1-carbon-gen-10");
    expect(item.variant.stock).toEqual({ available: true, quantity: null });
    expect(item.variant.images).toHaveLength(2);
    expect(item.variant.images[0].largeUrl).toBe("https://laptopid.ee/images/product/6678/30530/original.png");
    const found = filterItems(items, { ...emptyQuery(), q: "x1 carbon 256" }).map((i) => i.variant.id);
    expect(found).toContain("laptopid-6678");
    // Laptopid.ee kirjapilt "G10" leiab kanoonilise "Gen 10"
    expect(filterItems(items, { ...emptyQuery(), q: "x1 carbon g10" }).map((i) => i.variant.id)).toContain("laptopid-6678");
    const xps = items.find((i) => i.variant.id === "laptopid-6493")!;
    expect(xps.variant.conditionNotes).toBe("Üks USB-C ei tööta");
    expect(xps.variant.gpu).toEqual({ model: "NVIDIA GeForce RTX 4070", dedicated: true });
  });

  it("ostukorv: täpne pakkumine; teadmata kogusest lubatakse 1 tk, rohkem → piiratakse ja selgitatakse", async () => {
    const { resolveCart } = await import("@/server/cart/cart-actions");
    const cart = await resolveCart([{ variantId: "laptopid-6675", quantity: 3 }]);
    expect(cart.lines).toHaveLength(1);
    expect(cart.lines[0]).toMatchObject({ quantity: 1, maxQuantity: 1, quantityUnknown: true, quantityLimited: true });
    expect(cart.lines[0].item.variant.sku).toBe("LP-6675");
    expect(cart.subtotalCents).toBe(129_900);
  });

  it("New / Demo / Outlet jõuavad kataloogi seisukorraga 'Uus'; tarnija algne klass säilib andmebaasis", async () => {
    const items = await catalogItems();
    for (const [externalId, raw] of [["6224", "New"], ["5643", "Demo"], ["6629", "Outlet"]] as const) {
      const item = items.find((i) => i.variant.id === `laptopid-${externalId}`);
      expect(item?.variant.grade).toBe("NEW");
      const row = await listing(externalId);
      expect(row.grade).toBe("NEW");
      expect(row.details.sourceGrade).toBe(raw);
      expect((row.rawData as { product: { grade: string } }).product.grade).toBe(raw);
    }
    // Seisukorra filtri väärtused: "uus", mitte "demo"/"outlet"
    const { FACETS } = await import("@/domain/catalog/facets");
    const gradeValues = new Set(items.flatMap((i) => FACETS.grade.valuesOf(i)));
    expect(gradeValues.has("uus")).toBe(true);
    expect([...gradeValues].some((v) => /demo|outlet|new/i.test(v))).toBe(false);
    const { filterItems } = await import("@/domain/catalog/filtering");
    const { emptyQuery } = await import("@/domain/catalog/query");
    const onlyNew = filterItems(items, { ...emptyQuery(), facets: { ...emptyQuery().facets, grade: ["uus"] } }).map((i) => i.variant.id).sort();
    expect(onlyNew).toEqual(["laptopid-5643", "laptopid-6224", "laptopid-6629"]);
  });

  it("'Uus' pakkumine: ostukorv, kassa ja tellimuse snapshot (seisukord NEW)", async () => {
    const { resolveCart } = await import("@/server/cart/cart-actions");
    const cart = await resolveCart([{ variantId: "laptopid-6224", quantity: 1 }]);
    expect(cart.lines[0]).toMatchObject({ quantity: 1 });
    expect(cart.lines[0].item.variant.grade).toBe("NEW");

    const { computeCheckout } = await import("@/server/checkout/checkout-service");
    const { placeOrder } = await import("@/server/orders/order-service");
    const items = [{ variantId: "laptopid-5643", quantity: 1 }];
    const { quote } = await computeCheckout(t.db, { items, couponCode: null });
    expect(quote.issues).toEqual([]);
    expect(quote.lines[0]).toMatchObject({ grade: "NEW", unitPriceCents: 134_900 });
    const created = await placeOrder(t.db, {
      idempotencyKey: crypto.randomUUID(),
      items,
      couponCode: null,
      form,
      acknowledged: { lines: quote.lines.map((l) => ({ variantId: l.variantId, unitPriceCents: l.unitPriceCents })), totalCents: quote.totalCents, discountCents: 0 },
    });
    if (created.status !== "CREATED") throw new Error(created.status);
    const [order] = await t.db.select().from(orders).where(eq(orders.orderNumber, created.orderNumber));
    const [item] = await t.db.select().from(orderItems).where(eq(orderItems.orderId, order.id));
    expect(item.grade).toBe("NEW");
  });

  it("Lenovo V330-14IKB: kataloogis õige nimega, V-seeria, otsing 'V330-14IKB' ja 'V330' leiab, duplikaati ei teki", async () => {
    const { filterItems } = await import("@/domain/catalog/filtering");
    const { emptyQuery } = await import("@/domain/catalog/query");
    const items = await catalogItems();
    const v330 = items.find((i) => i.variant.id === "laptopid-1670")!;
    expect(v330.product).toMatchObject({ title: "Lenovo V330-14IKB", brand: "lenovo", series: "V Series", model: "V330-14IKB", slug: "lenovo-v330-14ikb" });
    expect(v330.variant).toMatchObject({ grade: "B", ramGb: 8, storageGb: 256, stock: { available: true, quantity: null } });
    expect(v330.variant.images).toHaveLength(2);
    for (const q of ["V330-14IKB", "V330", "lenovo v330"]) {
      expect(filterItems(items, { ...emptyQuery(), q }).map((i) => i.variant.id)).toContain("laptopid-1670");
    }
    const rows = await t.db.select().from(supplierListings).where(and(eq(supplierListings.supplier, "laptopid"), eq(supplierListings.supplierProductId, "1670")));
    expect(rows).toHaveLength(1);
    const [{ n }] = await t.db.select({ n: count() }).from(productModels).where(eq(productModels.slug, "lenovo-v330-14ikb"));
    expect(n).toBe(1);
  });

  it("puuduv API seadistus → kontrollitud viga (NOT_CONFIGURED), kataloog jääb puutumata", async () => {
    const { fetchLaptopidRaw } = await import("@/integrations/laptopid/laptopid-client");
    const before = await t.db.select().from(supplierListings).where(eq(supplierListings.supplier, "laptopid"));
    const result = await sync(() => fetchLaptopidRaw({ env: {} }));
    expect(result.status).toBe("FAILED");
    if (result.status === "FAILED") expect(result.error).toMatch(/LAPTOPID_API_BASE_URL puudub/);
    const after = await t.db.select().from(supplierListings).where(eq(supplierListings.supplier, "laptopid"));
    expect(after.map((r) => [r.id, r.available, r.salePriceCents])).toEqual(before.map((r) => [r.id, r.available, r.salePriceCents]));
  });

  it("kassa loeb hinna andmebaasist; kogus 1 lubatud, kogus 2 → selge teade ilma '1 tk' väiteta", async () => {
    const { computeCheckout } = await import("@/server/checkout/checkout-service");
    const one = await computeCheckout(t.db, { items: [{ variantId: "laptopid-6675", quantity: 1 }], couponCode: null });
    expect(one.quote.issues).toEqual([]);
    expect(one.quote.lines[0]).toMatchObject({ unitPriceCents: 129_900, quantity: 1, imageUrl: "https://laptopid.ee/images/product/6675/30400/small.png" });
    expect(one.items[0].listingId).toBe((await listing("6675")).id);

    const two = await computeCheckout(t.db, { items: [{ variantId: "laptopid-6675", quantity: 2 }], couponCode: null });
    expect(two.quote.lines).toHaveLength(0);
    expect(two.quote.issues[0]).toMatchObject({ kind: "INSUFFICIENT_STOCK", quantityKnown: false, message: UNKNOWN_QUANTITY_LIMIT_MESSAGE });
  });

  it("sooduskood töötab uute pakkumistega; ostuhind puudub → marginaalikaitse ei piira (kontrollimata)", async () => {
    await t.db.insert(discountCodes).values({ code: "LAP10", normalizedCode: "LAP10", name: "Test", type: "PERCENTAGE", value: 1000, status: "ACTIVE", scope: "ALL_PRODUCTS" });
    const { computeCheckout } = await import("@/server/checkout/checkout-service");
    const { quote } = await computeCheckout(t.db, { items: [{ variantId: "laptopid-6675", quantity: 1 }], couponCode: "lap10" });
    expect(quote.discountError).toBeNull();
    expect(quote.discount?.amountCents).toBe(12_990);
  });

  it("sync'i hinnamuutus → kassa tuvastab ja küsib kinnitust; vana tellimuse rida (snapshot) ei muutu", async () => {
    const { computeCheckout, detectPriceChanges } = await import("@/server/checkout/checkout-service");
    const { placeOrder } = await import("@/server/orders/order-service");
    const items = [{ variantId: "laptopid-6602", quantity: 1 }];
    const seen = (await computeCheckout(t.db, { items, couponCode: null })).quote;
    const created = await placeOrder(t.db, {
      idempotencyKey: crypto.randomUUID(),
      items,
      couponCode: null,
      form,
      acknowledged: { lines: seen.lines.map((l) => ({ variantId: l.variantId, unitPriceCents: l.unitPriceCents })), totalCents: seen.totalCents, discountCents: 0 },
    });
    if (created.status !== "CREATED") throw new Error(created.status);
    const [order] = await t.db.select().from(orders).where(eq(orders.orderNumber, created.orderNumber));
    const [itemBefore] = await t.db.select().from(orderItems).where(eq(orderItems.orderId, order.id));

    const payload = basePayload();
    (payload.products as Record<string, unknown>[])[2] = laptopidProduct({ id: 6602, cpu: "Intel i7-1260P 4700MHz", ram: "32GB LPDDR5", storage: "1TB SSD", grade: "A+", sale_price: "1199.00" });
    await sync(payload);

    const now = (await computeCheckout(t.db, { items, couponCode: null })).quote;
    expect(detectPriceChanges(now, seen.lines)).toEqual([{ variantId: "laptopid-6602", title: "Lenovo ThinkPad X1 Carbon G10", oldCents: 134_900, newCents: 119_900 }]);
    const review = await placeOrder(t.db, {
      idempotencyKey: crypto.randomUUID(),
      items,
      couponCode: null,
      form,
      acknowledged: { lines: seen.lines.map((l) => ({ variantId: l.variantId, unitPriceCents: l.unitPriceCents })), totalCents: seen.totalCents, discountCents: 0 },
    });
    expect(review.status).toBe("REVIEW");
    const [itemAfter] = await t.db.select().from(orderItems).where(eq(orderItems.orderId, order.id));
    expect(itemAfter).toEqual(itemBefore);
    expect(itemAfter.unitPriceCents).toBe(134_900);
  });

  it("API viga või vigane vastus → sync ebaõnnestub, eelmine kataloog jääb alles", async () => {
    const before = await t.db.select().from(supplierListings).where(eq(supplierListings.supplier, "laptopid"));
    const storefrontBefore = (await catalogItems()).map((i) => [i.variant.id, i.variant.price]);
    expect(storefrontBefore.length).toBeGreaterThan(0);
    for (const payload of [
      async () => {
        throw new Error("products: HTTP 500");
      },
      async () => ({ products: { error: "Unauthorized" }, images: [] }),
      async () => ({ products: [], images: [] }),
    ]) {
      const result = await sync(payload);
      expect(result.status).toBe("FAILED");
    }
    const after = await t.db.select().from(supplierListings).where(eq(supplierListings.supplier, "laptopid"));
    expect(after.map((r) => [r.id, r.available, r.salePriceCents])).toEqual(before.map((r) => [r.id, r.available, r.salePriceCents]));
    // Pood (catalog-service mapper) näeb sama kataloogi — upstream viga poodi ei tühjenda
    expect((await catalogItems()).map((i) => [i.variant.id, i.variant.price])).toEqual(storefrontBefore);
    const failed = await t.db.select().from(catalogSyncRuns).where(eq(catalogSyncRuns.status, "FAILED"));
    expect(failed.length).toBeGreaterThanOrEqual(3);
    expect(logs.some((l) => l.level === "ERROR")).toBe(true);
  });

  it("poolik snapshot (ebaloogiliselt palju puudu) ei võta midagi maha", async () => {
    const { products, images } = laptopidSnapshot();
    const result = await sync({ products, images });
    if (result.status !== "SUCCESS") throw new Error(result.status);
    expect(result.snapshotTrusted).toBe(false);
    expect(result.stats).toMatchObject({ madeUnavailable: 0, missingNotDeactivated: 20 });
    expect((await listing("7000")).available).toBe(true);
  });

  it("usaldusväärne täielik snapshot: puuduv toode → mitte saadaval (poest ja kassast väljas); tagasi tulles taastub", async () => {
    const payload = basePayload();
    payload.products = (payload.products as Record<string, unknown>[]).filter((p) => p.id !== 6493);
    const gone = await sync(payload);
    if (gone.status !== "SUCCESS") throw new Error(gone.status);
    expect(gone.snapshotTrusted).toBe(true);
    expect(gone.stats.madeUnavailable).toBe(1);
    expect((await listing("6493")).available).toBe(false);
    expect((await catalogItems()).some((i) => i.variant.id === "laptopid-6493")).toBe(false);
    const { computeCheckout } = await import("@/server/checkout/checkout-service");
    const blocked = await computeCheckout(t.db, { items: [{ variantId: "laptopid-6493", quantity: 1 }], couponCode: null });
    expect(blocked.quote.lines).toHaveLength(0);
    expect(blocked.quote.issues[0]).toMatchObject({ kind: "UNAVAILABLE" });

    const back = await sync(basePayload());
    if (back.status !== "SUCCESS") throw new Error(back.status);
    expect(back.stats.reactivated).toBe(1);
    expect((await listing("6493")).available).toBe(true);
    expect((await catalogItems()).some((i) => i.variant.id === "laptopid-6493")).toBe(true);
  });

  it("pildid: eemaldatud pilt kustub, uus lisatakse (mõõdud loetakse ainult uuel pildil)", async () => {
    const payload = basePayload();
    payload.images = [...laptopidImages(6678, [30531, 30999]), ...laptopidImages(6675, [30400]), ...laptopidImages(6493, [29001, 29002]), ...laptopidImages(1670, [8001, 8002])];
    const probesBefore = probeCalls;
    const result = await sync(payload);
    if (result.status !== "SUCCESS") throw new Error(result.status);
    expect(result.stats).toMatchObject({ imagesAdded: 1, imagesRemoved: 1 });
    expect(probeCalls - probesBefore).toBe(1);
    const row = await listing("6678");
    const images = await t.db.select().from(listingImages).where(eq(listingImages.supplierListingId, row.id));
    expect(images.map((i) => i.sourceId).sort()).toEqual(["30531", "30999"]);
  });

  it("lukk: kui teine sync käib, see jääb vahele; aegunud lukk võetakse üle", async () => {
    const [running] = await t.db.insert(catalogSyncRuns).values({ source: "LAPTOPID", status: "RUNNING", trigger: "TEST", leaseUntil: new Date(Date.now() + 60_000) }).returning();
    expect((await sync(basePayload())).status).toBe("BUSY");
    await t.db.update(catalogSyncRuns).set({ leaseUntil: new Date(Date.now() - 1000) }).where(eq(catalogSyncRuns.id, running.id));
    expect((await sync(basePayload())).status).toBe("SUCCESS");
    const [stale] = await t.db.select().from(catalogSyncRuns).where(eq(catalogSyncRuns.id, running.id));
    expect(stale.status).toBe("FAILED");
  });

  it("samaaegsed käivitused (nt ajastaja + admin „Sync now“): üks töötab, teine saab BUSY; duplikaate ei teki", async () => {
    const countBefore = (await t.db.select({ n: count() }).from(supplierListings).where(eq(supplierListings.supplier, "laptopid")))[0].n;
    let release: () => void = () => {};
    const gate = new Promise<void>((resolve) => (release = resolve));
    const slow = sync(async () => {
      await gate;
      return basePayload();
    });
    // Esimene hoiab lukku (ootab API vastust) — teine käivitus samal ajal
    await new Promise((resolve) => setTimeout(resolve, 200));
    const second = await sync(basePayload());
    release();
    const first = await slow;
    expect(second.status).toBe("BUSY");
    expect(first.status).toBe("SUCCESS");
    const running = await t.db.select().from(catalogSyncRuns).where(eq(catalogSyncRuns.status, "RUNNING"));
    expect(running).toHaveLength(0);
    const countAfter = (await t.db.select({ n: count() }).from(supplierListings).where(eq(supplierListings.supplier, "laptopid")))[0].n;
    expect(countAfter).toBe(countBefore);
  });

  it("mock-kataloog on andmebaasis alles; arhiveerimisel kaob poest, Laptopid jääb", async () => {
    await t.db.update(supplierListings).set({ status: "ARCHIVED" }).where(eq(supplierListings.supplier, "mock"));
    const items = await catalogItems();
    expect(items.every((i) => i.variant.id.startsWith("laptopid-"))).toBe(true);
    expect(items.length).toBe(28);
    const [{ n }] = await t.db.select({ n: count() }).from(supplierListings).where(eq(supplierListings.supplier, "mock"));
    expect(n).toBeGreaterThan(0);
  });
});

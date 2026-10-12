import { and, count, eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { createTestDatabase, hasTestDatabase, type TestDatabase } from "@/test/test-db";
import { catalogSyncRuns, listingImages, orderItemProcurements, orderItems, orders, productImages, productModels, supplierListings } from "@/server/db/schema";
import { MAC_DIMS, foxwayFeeds, foxwayLine, type FoxwayLineInput } from "@/integrations/foxway/foxway-fixtures";
import type { FoxwayFeedInput } from "@/integrations/foxway/foxway-snapshot";
import type { FoxwayLine } from "@/integrations/foxway/foxway-schema";
import { PAGE_SIZE, parseCatalogQuery } from "@/domain/catalog/query";

/**
 * Foxway sync päris PostgreSQL-is (ajutine skeem test_xxxx — poe andmeid ei puututa). Foxway API on asendatud
 * fiktiivsete ridadega (SKU 0120…TEST) — päris API-t ei kutsuta.
 */

const state = vi.hoisted(() => ({ db: null as unknown }));

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ updateTag: () => {}, revalidateTag: () => {}, cacheTag: () => {}, cacheLife: () => {}, refresh: () => {} }));
vi.mock("@/server/db/client", async (importOriginal) => ({ ...(await importOriginal<object>()), getDb: () => state.db, isDatabaseConfigured: () => true }));
vi.mock("@/server/logging/system-log", () => ({ writeSystemLog: async () => {}, newErrorId: () => "TESTID", errorMessage: (e: unknown) => String(e) }));
vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => undefined, set: () => {} }), headers: async () => new Headers() }));
vi.mock("@/server/auth/auth", () => ({ getClientMeta: async () => ({ ip: "10.9.9.7", userAgent: "vitest" }) }));

const sku = (n: number) => `0120${String(n).padStart(6, "0")}TEST`;

/** Põhiseis: tavalised, rikkega, blokeeritud, MacBook ja duplikaat (working + new) */
function baseLines(): Record<string, FoxwayLineInput> {
  return {
    t14: { sku: sku(1), name: 'Lenovo ThinkPad T14 Gen 3 (Intel) 14"', quantity: 4, price: 400, dims: { Keyboard: "SCA", Boxed: "Charger included" } },
    lcd: { sku: sku(2), name: 'Lenovo ThinkPad T14 Gen 3 (Intel) 14"', quantity: 1, price: 350, dims: { Functionality: "Working*", "PC Fault Descriptions": "Minor LCD fault", Keyboard: "FRA", Appearance: "Grade C+" } },
    sticker: { sku: sku(3), name: 'Dell Latitude 5440 14"', quantity: 2, price: 380, dims: { "PC Fault Descriptions": "Scratched on Purpose", Keyboard: "DEU", Boxed: "Unboxed" } },
    camera: { sku: sku(4), name: 'Dell Latitude 5440 14"', quantity: 5, price: 300, dims: { Functionality: "Working*", "PC Fault Descriptions": "Minor cosmetic fault", "PC Additional Fault": "Faulty Camera" } },
    unknown: { sku: sku(5), name: 'HP EliteBook 840 G8 14"', quantity: 1, price: 330, dims: { "PC Fault Descriptions": "Mystery wobble" } },
    precision: { sku: sku(6), name: 'Dell Precision 7670 16"', quantity: 1, price: 900, vatMargin: true, dims: { Boxed: "Unboxed", "GPU laptops": "RTX A2000 8GB", Keyboard: "USA" } },
    mac: { sku: sku(7), name: 'Apple Macbook Air (13" 2020, M1)', itemGroupId: 54, quantity: 3, price: 450, dims: { ...MAC_DIMS, Appearance: "Grade A" } },
  };
}

const brandNewMac: FoxwayLineInput = { sku: sku(8), name: 'Apple MacBook Pro (16" 2023, M2)', itemGroupId: 54, quantity: 2, price: 1960, dims: { ...MAC_DIMS, Appearance: "Brand New", Boxed: "Original Box", "CPU Laptops": "Apple M2 Pro 12-Core", Keyboard: "FRA" } };

function feeds(lines: Record<string, FoxwayLineInput>, extra: { newMac?: FoxwayLine[]; workingPc?: FoxwayLine[] } = {}): FoxwayFeedInput[] {
  const all = Object.values(lines);
  return foxwayFeeds({
    workingPc: [...all.filter((l) => l.itemGroupId !== 54).map(foxwayLine), ...(extra.workingPc ?? [])],
    workingMac: [...all.filter((l) => l.itemGroupId === 54).map(foxwayLine), foxwayLine(brandNewMac)],
    newMac: extra.newMac ?? [foxwayLine(brandNewMac)],
  });
}

describe.skipIf(!hasTestDatabase)("Foxway sync (andmebaas)", () => {
  let t: TestDatabase;

  const sync = async (input: FoxwayFeedInput[] | (() => Promise<FoxwayFeedInput[]>), options: { allowLargeDrop?: boolean } = {}) => {
    const { runFoxwaySync } = await import("./foxway-sync");
    return runFoxwaySync(t.db, { trigger: "TEST", allowLargeDrop: options.allowLargeDrop, loadFeeds: typeof input === "function" ? input : async () => input, log: async () => {} });
  };
  const ok = async (input: FoxwayFeedInput[], options: { allowLargeDrop?: boolean } = {}) => {
    const result = await sync(input, options);
    if (result.status !== "SUCCESS") throw new Error(`${result.status}: ${"error" in result ? result.error : ""}`);
    return result;
  };
  const listing = async (supplierSku: string) =>
    (await t.db.select().from(supplierListings).where(and(eq(supplierListings.supplier, "foxway"), eq(supplierListings.supplierProductId, supplierSku))))[0];
  const catalogItems = async () => {
    const { mapCatalogRows } = await import("@/server/catalog/db-catalog-mapper");
    const [models, listings, images, unitImages] = await Promise.all([t.db.select().from(productModels), t.db.select().from(supplierListings), t.db.select().from(productImages), t.db.select().from(listingImages)]);
    return mapCatalogRows(models, listings, images, unitImages).items;
  };
  const item = async (supplierSku: string) => (await catalogItems()).find((i) => i.variant.id === `foxway-${supplierSku.toLowerCase()}`);

  beforeAll(async () => {
    t = await createTestDatabase();
    state.db = t.db;
    // Olemasolev kataloog (mock-mudelid + Icecati pildid, nt ThinkPad T14 Gen 3) — Foxway peab sellega kokku minema
    const { seedCatalog } = await import("@/server/db/seed/seed-catalog");
    const { loadSeedSources } = await import("@/server/db/seed/seed-sources");
    await seedCatalog(t.db, (await loadSeedSources()).sources);
    // Sama mudeli Laptopid.ee pakkumisel on pikem garantii (36 kuud) → Foxway pakkumine saab samuti 36
    const [t14] = await t.db.select().from(productModels).where(eq(productModels.slug, "lenovo-thinkpad-t14-gen-3"));
    await t.db.update(supplierListings).set({ warrantyMonths: 36 }).where(eq(supplierListings.productModelId, t14.id));
  }, 120_000);

  afterAll(async () => {
    await t?.cleanup();
  });

  it("esimene sync: SKU identiteet, täpne laoseis, hind (KM + 60 + laadija), tarne 2–4, garantii, seisukord, klaviatuur", async () => {
    const result = await ok(feeds(baseLines()));
    expect(result.snapshotTrusted).toBe(true);
    expect(result.stats).toMatchObject({ fetchedWorkingPc: 6, fetchedWorkingMac: 2, fetchedNewMac: 1, fetchedNewPc: 0, uniqueSkus: 8, created: 8, blocked: 1, review: 1, duplicateSkus: 1 });

    const t14 = await listing(sku(1));
    expect(t14).toMatchObject({
      sku: `FX-${sku(1)}`,
      supplierSku: sku(1),
      stock: 4,
      available: true,
      grade: "B",
      keyboard: "SCA",
      deliveryMinDays: 2,
      deliveryMaxDays: 4,
      priceSource: "SUPPLIER",
      vatScheme: "STANDARD",
      salePriceCents: 40_000 + 9_600 + 6_000,
      supplierPriceCents: 40_000,
      chargerIncluded: true,
      warrantyMonths: 36, // Laptopid.ee sama mudeli pikem garantii jääb kehtima
      qualityHold: null,
      supplierVatMargin: false,
      status: "ACTIVE",
    });
    expect(t14.details).toMatchObject({ source: "FOXWAY", batteryWarrantyMonths: 6, chargerLabel: "Laadija kaasas" });
    expect((t14.rawData as { foxway: { itemVariantId: string; batteryStatus: string } }).foxway).toMatchObject({ itemVariantId: "50001", batteryStatus: "Holds Charge" });

    // Unboxed tavaline +35 €; Unboxed tööjaam +90 €
    expect(await listing(sku(3))).toMatchObject({ salePriceCents: 38_000 + 9_120 + 6_000 + 3_500, warrantyMonths: 12, keyboard: "DE", vatScheme: "STANDARD" });
    // IsVatMargin=true (SKU tasemel): kasutatud kauba erikord — hind + 60 + laadija, KM-i ostuhinnale ei lisata; jääb aktiivseks
    expect(await listing(sku(6))).toMatchObject({ salePriceCents: 90_000 + 6_000 + 9_000, supplierPriceCents: 99_000, supplierVatMargin: true, vatScheme: "MARGIN", qualityHold: null, keyboard: "US" });
    expect((await item(sku(6)))?.variant.price).toMatchObject({ saleCents: 105_000, vatScheme: "MARGIN" });
    // C+ säilib
    expect(await listing(sku(2))).toMatchObject({ grade: "C+", qualityHold: null });
  });

  it("rikked: blokeeritud (Faulty Camera lisareana) ja tundmatu (REVIEW) ei ole poes; lubatud märkused on", async () => {
    expect(await listing(sku(4))).toMatchObject({ qualityHold: "BLOCKED", qualityHoldReason: expect.stringContaining("Faulty Camera") });
    expect(await listing(sku(5))).toMatchObject({ qualityHold: "REVIEW", qualityHoldReason: expect.stringContaining("Mystery wobble") });
    expect(await item(sku(4))).toBeUndefined();
    expect(await item(sku(5))).toBeUndefined();
    const lcd = await item(sku(2));
    expect(lcd?.variant.details.conditionNotices).toEqual([expect.objectContaining({ severity: "NOTICE", text: expect.stringContaining("nõrgad laigud") })]);
    expect(JSON.stringify(lcd)).not.toMatch(/Working\*|Minor LCD/);
    expect((await item(sku(3)))?.variant.details.conditionNotices?.[0]).toMatchObject({ severity: "INFO", text: "Korpusel võib olla kleepsu eemaldamisest jäänud kerge jälg." });
  });

  it("tehnilised andmed: omadusi, mida Foxway ei anna (HDMI, sõrmejälg …), ei näidata 'Ei'-na (ei leiutata)", async () => {
    const { buildSpecSections } = await import("@/domain/catalog/spec-sections");
    const t14 = await item(sku(1));
    const labels = buildSpecSections(t14!).flatMap((s) => s.rows.map((r) => r.label));
    for (const missing of ["HDMI", "Thunderbolt", "Sõrmejäljelugeja", "Numbriklahvistik", "Klaviatuuri taustavalgus"]) expect(labels).not.toContain(missing);
    expect(t14!.variant.features).toMatchObject({ hdmi: null, fingerprint: null, "dedicated-gpu": false });
  });

  it("13. sama SKU working + new → üks pakkumine, kogust ei liideta; Brand New → Uus", async () => {
    const rows = await t.db.select().from(supplierListings).where(eq(supplierListings.supplierProductId, sku(8)));
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ stock: 2, grade: "NEW" });
    expect((rows[0].rawData as { foxway: { catalogs: string[] } }).foxway.catalogs).toEqual(["working", "new"]);
    expect((await item(sku(8)))?.variant.details).toMatchObject({ originalBox: true, chargerLabel: "Originaalkarp ja laadija kaasas" });
  });

  it("30. olemasolev ProductModel taaskasutatakse (T14 Gen 3 + selle Icecati pildid); uus mudel ilma piltideta", async () => {
    const [t14Model] = await t.db.select().from(productModels).where(eq(productModels.slug, "lenovo-thinkpad-t14-gen-3"));
    expect((await listing(sku(1))).productModelId).toBe(t14Model.id);
    const t14 = await item(sku(1));
    expect(t14?.product.images.length).toBeGreaterThan(0);
    const [{ n }] = await t.db.select({ n: count() }).from(productModels).where(eq(productModels.slug, "lenovo-thinkpad-t14-gen-3"));
    expect(n).toBe(1);
    const mac = await t.db.select().from(productModels).where(eq(productModels.slug, "apple-macbook-air-13-2020-m1"));
    expect(mac).toHaveLength(1);
    expect(mac[0]).toMatchObject({ manufacturer: "apple", family: "MacBook Air", weightKg: null });
    const run = (await t.db.select().from(catalogSyncRuns).where(eq(catalogSyncRuns.source, "FOXWAY")))[0];
    expect(run.stats).toMatchObject({ imagesMissing: expect.any(Number), modelsReused: expect.any(Number) });
  });

  it("29. idempotentne: sama snapshot teist korda → uusi ridu ega muudatusi pole", async () => {
    const before = (await t.db.select({ n: count() }).from(supplierListings))[0].n;
    const result = await ok(feeds(baseLines()));
    expect(result.stats).toMatchObject({ created: 0, updated: 0, unchanged: 8, modelsCreated: 0 });
    expect((await t.db.select({ n: count() }).from(supplierListings))[0].n).toBe(before);
  });

  it("laoseis, hind, seisukord ja rike muutuvad → pakkumine uueneb; 17. laoseis 0 → poest väljas (ei kustutata)", async () => {
    const lines = baseLines();
    lines.t14 = { ...lines.t14, quantity: 7, price: 410 };
    lines.sticker = { ...lines.sticker, dims: { ...lines.sticker.dims, "PC Additional Fault": "Severe LCD Damage" } };
    lines.mac = { ...lines.mac, quantity: 0 };
    const result = await ok(feeds(lines));
    expect(result.stats.updated).toBe(3);
    expect(await listing(sku(1))).toMatchObject({ stock: 7, salePriceCents: 41_000 + 9_840 + 6_000 });
    expect(await listing(sku(3))).toMatchObject({ qualityHold: "BLOCKED" });
    expect(await listing(sku(7))).toMatchObject({ stock: 0, available: false });
    expect(await item(sku(7))).toBeUndefined();
    expect(await item(sku(3))).toBeUndefined();
  });

  it("17. SKU kaob usaldusväärsest snapshot'ist → laoseis 0 + available=false (rida ja ajalugu jäävad)", async () => {
    const lines = baseLines();
    delete (lines as Partial<typeof lines>).precision;
    const result = await ok(feeds(lines));
    expect(result.snapshotTrusted).toBe(true);
    expect(await listing(sku(6))).toMatchObject({ stock: 0, available: false, status: "ACTIVE" });
    // Tagasi → taastub
    await ok(feeds(baseLines()));
    expect(await listing(sku(6))).toMatchObject({ stock: 1, available: true });
  });

  it("18. katkine/osaline snapshot EI võta massiliselt maha: feed'i viga → FAILED; suur kadu → puuduvaid ei puututa", async () => {
    const before = await t.db.select().from(supplierListings).where(eq(supplierListings.supplier, "foxway"));
    const failed = await sync(async () => {
      throw new Error("Working · Mac Laptops: HTTP 500");
    });
    expect(failed.status).toBe("FAILED");
    const after = await t.db.select().from(supplierListings).where(eq(supplierListings.supplier, "foxway"));
    expect(after.map((l) => [l.supplierProductId, l.stock, l.available])).toEqual(before.map((l) => [l.supplierProductId, l.stock, l.available]));

    // Ainult 1 rida (kõik teised puuduvad) → üle piiri → snapshot pole usaldusväärne, ükski ei lähe mahaks
    const big = Array.from({ length: 30 }, (_, i) => foxwayLine({ sku: sku(500 + i), name: 'HP EliteBook 840 G9 14"', quantity: 1 }));
    await ok(feeds(baseLines(), { workingPc: big }));
    const partial = await ok(foxwayFeeds({ workingPc: [foxwayLine(baseLines().t14)] }));
    expect(partial.snapshotTrusted).toBe(false);
    expect(partial.stats.missingNotDeactivated).toBeGreaterThan(20);
    expect(await listing(sku(500))).toMatchObject({ available: true, stock: 1 });
    // Admin kinnitab suure muutuse → nüüd võetakse maha
    const confirmed = await ok(foxwayFeeds({ workingPc: [foxwayLine(baseLines().t14)] }), { allowLargeDrop: true });
    expect(confirmed.snapshotTrusted).toBe(true);
    expect(await listing(sku(500))).toMatchObject({ available: false, stock: 0 });
    await ok(feeds(baseLines(), { workingPc: big }), { allowLargeDrop: true });
  });

  it("28. admini parandused jäävad sync'i üle alles (hind, seisukord, avaldamine ülevaatusest)", async () => {
    const l = await listing(sku(1));
    await t.db.update(supplierListings).set({ manualOverrides: { salePriceCents: 39_900, grade: "A" } }).where(eq(supplierListings.id, l.id));
    const review = await listing(sku(5));
    await t.db.update(supplierListings).set({ manualOverrides: { qualityHold: null } }).where(eq(supplierListings.id, review.id));
    const lines = baseLines();
    lines.t14 = { ...lines.t14, price: 420 };
    await ok(feeds(lines, { workingPc: Array.from({ length: 30 }, (_, i) => foxwayLine({ sku: sku(500 + i), name: 'HP EliteBook 840 G9 14"', quantity: 1 })) }));
    const after = await listing(sku(1));
    expect(after.manualOverrides).toEqual({ salePriceCents: 39_900, grade: "A" });
    expect(after.salePriceCents).toBe(42_000 + 10_080 + 6_000); // tarnija väärtus uueneb
    const t14 = await item(sku(1));
    expect(t14?.variant).toMatchObject({ grade: "A", price: expect.objectContaining({ saleCents: 39_900 }) });
    // Admin avaldas teadlikult REVIEW pakkumise → poes; sync jättis tarnija hold'i alles
    expect(await listing(sku(5))).toMatchObject({ qualityHold: "REVIEW", manualOverrides: { qualityHold: null } });
    expect(await item(sku(5))).toBeDefined();
  });

  it("ostukorv/kassa: täpne laoseis → kogus kuni laoseisuni; blokeeritud SKU-d ei saa osta", async () => {
    const { computeCheckout } = await import("@/server/checkout/checkout-service");
    const id = `foxway-${sku(3).toLowerCase()}`;
    // sku(3) on nüüd tagasi (baseLines) → laoseis 2
    expect((await computeCheckout(t.db, { items: [{ variantId: id, quantity: 2 }], couponCode: null })).quote.issues).toEqual([]);
    expect((await computeCheckout(t.db, { items: [{ variantId: id, quantity: 3 }], couponCode: null })).quote.issues.length).toBeGreaterThan(0);
    const blocked = await computeCheckout(t.db, { items: [{ variantId: `foxway-${sku(4).toLowerCase()}`, quantity: 1 }], couponCode: null });
    expect(blocked.quote.issues.length).toBeGreaterThan(0);
  });

  it("24. klaviatuuri filter: valikud SQL-ist (kõik tarnijad, ainult olemasolevad), filtreerimine töötab", async () => {
    const { queryCatalogPage } = await import("@/server/catalog/catalog-queries");
    const page = await queryCatalogPage(t.db, parseCatalogQuery({}));
    const kb = page.facets.multi.kb.map((o) => o.value);
    expect(kb).toEqual(expect.arrayContaining(["sca", "fra", "us", "swe"]));
    expect(kb).not.toContain("ita"); // keegi ei müü ITA klaviatuuriga → valikut pole
    expect(page.facets.multi.kb.find((o) => o.value === "sca")?.label).toBe("Skandinaavia (SCA)");
    const sca = await queryCatalogPage(t.db, parseCatalogQuery({ kb: "sca" }));
    expect(sca.items.length).toBeGreaterThan(0);
    expect(sca.items.every((i) => i.variant.keyboardLayout === "SCA")).toBe(true);
    // C+ eraldi seisukorra valik
    expect(page.facets.multi.grade.map((o) => o.value)).toContain("c-plus");
    const cplus = await queryCatalogPage(t.db, parseCatalogQuery({ grade: "c-plus" }));
    expect(cplus.items.map((i) => i.variant.grade)).toEqual(["C+"]);
  });

  it("31. tooteleht: otsene mudeli päring tagastab ainult poes nähtavad Foxway konfiguratsioonid", async () => {
    const { queryProductDetail } = await import("@/server/catalog/catalog-queries");
    const detail = await queryProductDetail(t.db, "dell-latitude-5440");
    const ids = detail?.variants.map((v) => v.id) ?? [];
    expect(ids).toContain(`foxway-${sku(3).toLowerCase()}`);
    expect(ids).not.toContain(`foxway-${sku(4).toLowerCase()}`); // blokeeritud
    const mac = await queryProductDetail(t.db, "apple-macbook-air-13-2020-m1");
    expect(mac?.variants[0]).toMatchObject({ cpu: expect.objectContaining({ model: "Apple M1" }), display: expect.objectContaining({ resolutionLabel: "Retina" }) });
  });

  it("32. suur Foxway fikstuur: lehekülgedeks jaotus töötab (LIMIT), lehed ei kattu", async () => {
    const many = Array.from({ length: 150 }, (_, i) => foxwayLine({ sku: sku(1000 + i), name: 'Lenovo ThinkPad L14 Gen 4 (Intel) 14"', quantity: 1 + (i % 3), price: 200 + i, dims: { Keyboard: "HUN" } }));
    await ok(feeds(baseLines(), { workingPc: [...many, ...Array.from({ length: 30 }, (_, i) => foxwayLine({ sku: sku(500 + i), name: 'HP EliteBook 840 G9 14"', quantity: 1 }))] }));
    const { queryCatalogPage } = await import("@/server/catalog/catalog-queries");
    const first = await queryCatalogPage(t.db, parseCatalogQuery({ kb: "hun", sort: "price-asc" }));
    expect(first.total).toBe(150);
    expect(first.items).toHaveLength(PAGE_SIZE);
    expect(first.pageCount).toBe(Math.ceil(150 / PAGE_SIZE));
    const third = await queryCatalogPage(t.db, parseCatalogQuery({ kb: "hun", sort: "price-asc", page: "3" }));
    expect(third.items).toHaveLength(PAGE_SIZE);
    expect(new Set([...first.items, ...third.items].map((i) => i.variant.id)).size).toBe(PAGE_SIZE * 2);
    expect(third.items[0].variant.price.saleCents).toBeGreaterThan(first.items[PAGE_SIZE - 1].variant.price.saleCents);
  });

  it("tellimus: Foxway rida → hankekirje 'Tellida Foxwayst' (SKU, ItemVariantId, hinnakirja hind snapshot); automaatset tellimust pole", async () => {
    const { computeCheckout } = await import("@/server/checkout/checkout-service");
    const { placeOrder } = await import("@/server/orders/order-service");
    const items = [{ variantId: `foxway-${sku(1).toLowerCase()}`, quantity: 2 }];
    const { quote } = await computeCheckout(t.db, { items, couponCode: null });
    const created = await placeOrder(t.db, {
      idempotencyKey: crypto.randomUUID(),
      items,
      couponCode: null,
      form: { firstName: "Mari", lastName: "Maasikas", email: "mari@example.com", phone: "+372 5123 4567", addressLine1: "Pärnu mnt 1", addressLine2: null, city: "Tallinn", postalCode: "10115", country: "EE", isCompany: false, companyName: null, companyRegistryCode: null, companyVatNumber: null, customerNote: null },
      acknowledged: { lines: quote.lines.map((l) => ({ variantId: l.variantId, unitPriceCents: l.unitPriceCents })), totalCents: quote.totalCents, discountCents: 0 },
    });
    if (created.status !== "CREATED") throw new Error(created.status);
    const [order] = await t.db.select().from(orders).where(eq(orders.orderNumber, created.orderNumber));
    const [item] = await t.db.select().from(orderItems).where(eq(orderItems.orderId, order.id));
    const [procurement] = await t.db.select().from(orderItemProcurements).where(eq(orderItemProcurements.orderItemId, item.id));
    expect(item.vatScheme).toBe("STANDARD");
    expect(procurement).toMatchObject({ supplierVatMargin: false });
    expect(procurement).toMatchObject({ supplier: "foxway", supplierSku: sku(1), supplierVariantId: "50001", supplierListedPriceCents: 40_000, supplierCurrency: "EUR", status: "TO_ORDER", actualPurchasePriceCents: null });
    // Kliendi müügihind on rea snapshot (admini parandus 399 €), tarnija hind eraldi
    expect(item.unitPriceCents).toBe(39_900);
    // Hiljem muutuv Foxway hind ei muuda tellimuse snapshot'i
    const lines = baseLines();
    lines.t14 = { ...lines.t14, price: 999 };
    await ok(feeds(lines, { workingPc: Array.from({ length: 30 }, (_, i) => foxwayLine({ sku: sku(500 + i), name: 'HP EliteBook 840 G9 14"', quantity: 1 })) }));
    expect((await t.db.select().from(orderItemProcurements).where(eq(orderItemProcurements.id, procurement.id)))[0].supplierListedPriceCents).toBe(40_000);
    // Erikorra (IsVatMargin) SKU tellimus: KM režiim ja tarnija KM tüüp säilivad snapshot'is
    const marginItems = [{ variantId: `foxway-${sku(6).toLowerCase()}`, quantity: 1 }];
    const marginQuote = (await computeCheckout(t.db, { items: marginItems, couponCode: null })).quote;
    expect(marginQuote.lines[0]).toMatchObject({ vatScheme: "MARGIN", unitPriceCents: 105_000 });
    const marginOrder = await placeOrder(t.db, {
      idempotencyKey: crypto.randomUUID(),
      items: marginItems,
      couponCode: null,
      form: { firstName: "Mari", lastName: "Maasikas", email: "mari@example.com", phone: "+372 5123 4567", addressLine1: "Pärnu mnt 1", addressLine2: null, city: "Tallinn", postalCode: "10115", country: "EE", isCompany: true, companyName: "Firma OÜ", companyRegistryCode: "12345678", companyVatNumber: null, customerNote: null },
      acknowledged: { lines: marginQuote.lines.map((l) => ({ variantId: l.variantId, unitPriceCents: l.unitPriceCents })), totalCents: marginQuote.totalCents, discountCents: 0 },
    });
    if (marginOrder.status !== "CREATED") throw new Error(marginOrder.status);
    const [mOrder] = await t.db.select().from(orders).where(eq(orders.orderNumber, marginOrder.orderNumber));
    const [mItem] = await t.db.select().from(orderItems).where(eq(orderItems.orderId, mOrder.id));
    expect(mItem).toMatchObject({ vatScheme: "MARGIN", unitPriceCents: 105_000 });
    expect((await t.db.select().from(orderItemProcurements).where(eq(orderItemProcurements.orderItemId, mItem.id)))[0]).toMatchObject({ supplierVatMargin: true, supplierListedPriceCents: 90_000 });

    const { procurementDates } = await import("@/domain/orders/procurement");
    const now = new Date("2026-10-12T10:00:00Z");
    expect(procurementDates("SUPPLIER_SHIPPED", { orderedAt: null, supplierShippedAt: null, receivedAt: null }, now)).toEqual({ orderedAt: now, supplierShippedAt: now, receivedAt: null });
    expect(procurementDates("TO_ORDER", { orderedAt: now, supplierShippedAt: now, receivedAt: now }, now)).toEqual({ orderedAt: null, supplierShippedAt: null, receivedAt: null });
  });

  it("lukk: Foxway sync ei jookse iseendaga topelt (BUSY)", async () => {
    const { acquireSyncRun } = await import("./sync-runs");
    const runId = await acquireSyncRun(t.db, { source: "FOXWAY", trigger: "TEST" });
    expect(runId).toBeTruthy();
    expect((await sync(feeds(baseLines()))).status).toBe("BUSY");
    await t.db.update(catalogSyncRuns).set({ status: "FAILED" }).where(eq(catalogSyncRuns.id, runId!));
  });
});

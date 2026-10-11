import { asc, eq, inArray } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { createTestDatabase, hasTestDatabase, type TestDatabase } from "@/test/test-db";
import { listingImages, productImages, productModels, supplierListings } from "@/server/db/schema";

/**
 * Poe kataloogipäring (queryStorefrontCatalogRows) päris PostgreSQL-is, ajutises skeemis.
 * Põhinõue: kitsas päring annab TÄPSELT sama poe kataloogi kui täisridade lugemine, aga ei loe `raw_data`-t
 * ega ridu, mida pood kunagi ei näita.
 */

vi.mock("@/server/logging/system-log", () => ({ writeSystemLog: async () => {}, newErrorId: () => "TESTID", errorMessage: (e: unknown) => String(e) }));

describe.skipIf(!hasTestDatabase)("poe kataloogipäring (andmebaas)", () => {
  let t: TestDatabase;
  const ids: Record<string, string> = {};

  beforeAll(async () => {
    t = await createTestDatabase();
    const { seedCatalog } = await import("@/server/db/seed/seed-catalog");
    const { loadSeedSources } = await import("@/server/db/seed/seed-sources");
    await seedCatalog(t.db, (await loadSeedSources()).sources);

    // Erinevad seisundid (seed'is on kõik pakkumised ACTIVE, available = NULL, kogus teada)
    const rows = await t.db.select().from(supplierListings).orderBy(asc(supplierListings.sku)).limit(7);
    const [archived, unavailable, availableTrue, outOfStock, overriddenStock, withRaw, onHiddenModel] = rows;
    Object.assign(ids, {
      archived: archived.id,
      unavailable: unavailable.id,
      availableTrue: availableTrue.id,
      outOfStock: outOfStock.id,
      overriddenStock: overriddenStock.id,
      withRaw: withRaw.id,
    });
    await t.db.update(supplierListings).set({ status: "ARCHIVED" }).where(eq(supplierListings.id, archived.id));
    await t.db.update(supplierListings).set({ available: false }).where(eq(supplierListings.id, unavailable.id));
    await t.db.update(supplierListings).set({ available: true, stock: null }).where(eq(supplierListings.id, availableTrue.id));
    await t.db.update(supplierListings).set({ stock: 0 }).where(eq(supplierListings.id, outOfStock.id));
    // Admini parandus: tarnija kogus 0, admin 3 → müüdav (kogus on admini parandatav, seega SQL seda ei filtreeri)
    await t.db.update(supplierListings).set({ stock: 0, manualOverrides: { stock: 3 } }).where(eq(supplierListings.id, overriddenStock.id));
    await t.db.update(supplierListings).set({ rawData: { product: { secret: "x".repeat(5000) } } }).where(eq(supplierListings.id, withRaw.id));
    await t.db.update(productModels).set({ status: "HIDDEN" }).where(eq(productModels.id, onHiddenModel.productModelId));
    ids.hiddenModel = onHiddenModel.productModelId;
    const [image] = await t.db.select().from(productImages).limit(1);
    if (image) {
      await t.db.update(productImages).set({ isHidden: true }).where(eq(productImages.id, image.id));
      ids.hiddenImage = image.id;
    }
  }, 120_000);

  afterAll(async () => {
    await t?.cleanup();
  });

  it("annab sama poe kataloogi kui täisridade lugemine", async () => {
    const { mapCatalogRows } = await import("./db-catalog-mapper");
    const { queryStorefrontCatalogRows } = await import("./db-catalog");
    const [models, listings, images, unitImages] = await Promise.all([
      t.db.select().from(productModels),
      t.db.select().from(supplierListings).orderBy(asc(supplierListings.sku)),
      t.db.select().from(productImages).orderBy(asc(productImages.productModelId), asc(productImages.position)),
      t.db.select().from(listingImages),
    ]);
    const full = mapCatalogRows(models, listings, images, unitImages);
    const narrow = await queryStorefrontCatalogRows(t.db);
    const result = mapCatalogRows(narrow.models, narrow.listings, narrow.images, narrow.unitImages);
    expect(result.items.length).toBeGreaterThan(0);
    expect(result.items).toEqual(full.items);
    expect(result.incomplete).toEqual(full.incomplete);
  });

  it("ei loe tarnija toorandmeid (raw_data) ega ostuhinda", async () => {
    const { queryStorefrontCatalogRows } = await import("./db-catalog");
    const { listings } = await queryStorefrontCatalogRows(t.db);
    const row = listings.find((l) => l.id === ids.withRaw);
    expect(row).toBeDefined();
    expect(row).not.toHaveProperty("rawData");
    expect(row).not.toHaveProperty("supplierPriceCents");
  });

  it("jätab SQL-is välja ARCHIVED, available=false ja peidetud mudeli pakkumised ning peidetud pildid", async () => {
    const { queryStorefrontCatalogRows } = await import("./db-catalog");
    const { models, listings, images } = await queryStorefrontCatalogRows(t.db);
    const listingIds = new Set(listings.map((l) => l.id));
    expect(listingIds.has(ids.archived)).toBe(false);
    expect(listingIds.has(ids.unavailable)).toBe(false);
    expect(listings.some((l) => l.productModelId === ids.hiddenModel)).toBe(false);
    expect(models.some((m) => m.id === ids.hiddenModel)).toBe(false);
    expect(images.some((i) => i.isHidden)).toBe(false);
    expect(images.some((i) => i.productModelId === ids.hiddenModel)).toBe(false);
  });

  it("ACTIVE + saadaval pakkumine jõuab poodi; kogusekontroll (ka admini parandus) jääb mapperisse", async () => {
    const { mapCatalogRows } = await import("./db-catalog-mapper");
    const { queryStorefrontCatalogRows } = await import("./db-catalog");
    const rows = await queryStorefrontCatalogRows(t.db);
    // SQL ei otsusta koguse üle: available = true (kogus teadmata) ja tarnija kogus 0 jõuavad päringusse
    expect(rows.listings.map((l) => l.id)).toEqual(expect.arrayContaining([ids.availableTrue, ids.outOfStock, ids.overriddenStock]));

    const skus = new Map(
      (await t.db.select({ id: supplierListings.id, sku: supplierListings.sku }).from(supplierListings).where(inArray(supplierListings.id, [ids.availableTrue, ids.outOfStock, ids.overriddenStock]))).map((r) => [r.id, r.sku]),
    );
    const shown = new Set(mapCatalogRows(rows.models, rows.listings, rows.images, rows.unitImages).items.map((i) => i.variant.sku));
    expect(shown.has(skus.get(ids.availableTrue)!)).toBe(true);
    expect(shown.has(skus.get(ids.overriddenStock)!)).toBe(true);
    expect(shown.has(skus.get(ids.outOfStock)!)).toBe(false);
  });
});

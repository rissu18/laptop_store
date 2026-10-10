import { eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestDatabase, hasTestDatabase, type TestDatabase } from "@/test/test-db";
import { mapCatalogRows } from "@/server/catalog/db-catalog-mapper";
import { productImages, productModels, storeSettings, supplierListings } from "./schema";
import { countCatalog, seedCatalog } from "./seed/seed-catalog";
import { loadSeedSources } from "./seed/seed-sources";

/** DATABASE: ühendus, migratsioon, import ja selle idempotentsus (ajutises skeemis). */
describe.skipIf(!hasTestDatabase)("andmebaas", () => {
  let t: TestDatabase;
  let seed: Awaited<ReturnType<typeof loadSeedSources>>;

  beforeAll(async () => {
    t = await createTestDatabase();
    seed = await loadSeedSources();
  }, 60_000);
  afterAll(async () => {
    await t?.cleanup();
  });

  it("ühendus töötab ja migratsioonid loovad kõik tabelid", async () => {
    const result = await t.db.execute<{ name: string }>(sql`SELECT table_name AS name FROM information_schema.tables WHERE table_schema = ${t.schema} ORDER BY 1`);
    expect(result.rows.map((r) => r.name)).toEqual([
      "admin_sessions",
      "admin_users",
      "audit_logs",
      "discount_codes",
      "discount_manufacturers",
      "discount_product_models",
      "discount_redemptions",
      "discount_supplier_listings",
      "discount_validation_attempts",
      "icecat_metadata",
      "login_attempts",
      "order_internal_notes",
      "order_items",
      "order_lookup_attempts",
      "order_status_history",
      "orders",
      "pricing_rules",
      "product_identifiers",
      "product_images",
      "product_models",
      "store_settings",
      "supplier_listings",
      "system_logs",
    ]);
  });

  it("import: andmebaasi arvud = allika arvud", async () => {
    const stats = await seedCatalog(t.db, seed.sources);
    expect(stats.models).toBe(seed.before.models);
    expect(stats.listings).toBe(seed.before.listings);
    expect(stats.images).toBe(seed.before.images);
    expect(stats.icecat).toEqual(seed.before.icecat);
    expect(stats.pricingErrors).toEqual([]);
  }, 120_000);

  it("import on idempotentne (korduv import ei tekita duplikaate)", async () => {
    const before = await countCatalog(t.db);
    await seedCatalog(t.db, seed.sources);
    expect(await countCatalog(t.db)).toEqual(before);
  }, 120_000);

  it("korduv import ei kirjuta üle admini muudatusi", async () => {
    const [listing] = await t.db.select().from(supplierListings).limit(1);
    const [model] = await t.db.select().from(productModels).where(eq(productModels.id, listing.productModelId));
    const [image] = await t.db.select().from(productImages).where(eq(productImages.productModelId, model.id)).limit(1);
    await t.db.update(supplierListings).set({ salePriceCents: 12345, status: "HIDDEN", manualOverrides: { ramGb: 64 } }).where(eq(supplierListings.id, listing.id));
    await t.db.update(productModels).set({ featured: !model.featured, description: "Admini tekst" }).where(eq(productModels.id, model.id));
    if (image) await t.db.update(productImages).set({ isHidden: true }).where(eq(productImages.id, image.id));
    await t.db.update(storeSettings).set({ value: { text: "Admini garantii" } }).where(eq(storeSettings.key, "warranty"));

    await seedCatalog(t.db, seed.sources);

    const [listingAfter] = await t.db.select().from(supplierListings).where(eq(supplierListings.id, listing.id));
    expect(listingAfter.salePriceCents).toBe(12345);
    expect(listingAfter.status).toBe("HIDDEN");
    expect(listingAfter.manualOverrides).toEqual({ ramGb: 64 });
    expect(listingAfter.ramGb).toBe(listing.ramGb); // tarnija väärtus jääb alles
    const [modelAfter] = await t.db.select().from(productModels).where(eq(productModels.id, model.id));
    expect(modelAfter.featured).toBe(!model.featured);
    expect(modelAfter.description).toBe("Admini tekst");
    if (image) {
      const [imageAfter] = await t.db.select().from(productImages).where(eq(productImages.id, image.id));
      expect(imageAfter.isHidden).toBe(true);
    }
    const [warranty] = await t.db.select().from(storeSettings).where(eq(storeSettings.key, "warranty"));
    expect(warranty.value).toEqual({ text: "Admini garantii" });
  }, 120_000);

  it("andmebaasi kataloog sisaldab kõiki aktiivseid laos olevaid pakkumisi", async () => {
    const [models, listings, images] = await Promise.all([t.db.select().from(productModels), t.db.select().from(supplierListings), t.db.select().from(productImages)]);
    const { items, incomplete } = mapCatalogRows(models, listings, images);
    const expected = listings.filter((l) => l.status === "ACTIVE" && ((l.manualOverrides as { stock?: number })?.stock ?? l.stock ?? 0) > 0).length;
    expect(items.length + incomplete.length).toBe(expected);
    expect(incomplete).toEqual([]);
  });
});

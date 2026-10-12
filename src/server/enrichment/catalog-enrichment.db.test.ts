import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { createTestDatabase, hasTestDatabase, type TestDatabase } from "@/test/test-db";
import { listingImages, productIdentifiers, productImages, productModels, supplierListings } from "@/server/db/schema";
import type { ImportDependencies } from "@/server/images/icecat-image-import";

/**
 * Kataloogi rikastus päris PostgreSQL-is (ajutine skeem): allikate prioriteet (meie andmed → Laptopid.ee → Icecat),
 * Icecati ei küsita, kui Laptopid.ee vaste on olemas või identifikaatorit pole, ebakindel vaste ei lisa pilte,
 * idempotentsus ja admini otsuste (parandused, peidetud pildid) säilimine.
 */

vi.mock("server-only", () => ({}));

describe.skipIf(!hasTestDatabase)("kataloogi rikastus (andmebaas)", () => {
  let t: TestDatabase;
  const ids: Record<string, string> = {};
  const icecatCalls: string[] = [];

  /** Icecat "klient": salvestab päringud; leiab ainult MPN-i "MVH22LL/A" (pealkiri klapib) */
  const icecat = {
    icecat: {
      async getProduct(identifier: { kind: string; mpn?: string }) {
        icecatCalls.push(identifier.mpn ?? identifier.kind);
        return { status: "NOT_FOUND" as const, message: "test" };
      },
      assetHeaders: () => ({}),
    },
    storage: { save: vi.fn(), delete: vi.fn(), exists: vi.fn() },
    repository: {} as never,
  } as unknown as ImportDependencies;

  async function model(slug: string, manufacturer: string, family: string, name: string, screenSizeIn: number) {
    const [row] = await t.db.insert(productModels).values({ slug, manufacturer, family, model: name, screenSizeIn }).returning({ id: productModels.id });
    ids[slug] = row.id;
    return row.id;
  }
  let n = 0;
  async function listing(modelId: string, supplier: string, values: Partial<typeof supplierListings.$inferInsert> = {}) {
    n++;
    const [row] = await t.db
      .insert(supplierListings)
      .values({ productModelId: modelId, supplier, supplierProductId: `${supplier}-${n}`, sku: `SKU-${n}`, available: true, stock: 1, cpu: "Intel Core i5-1135G7", ...values })
      .returning({ id: supplierListings.id });
    return row.id;
  }
  async function photos(listingId: string, count: number, prefix: string) {
    for (let i = 0; i < count; i++) {
      await t.db.insert(listingImages).values({
        supplierListingId: listingId,
        source: "LAPTOPID",
        sourceId: `${prefix}-${i}`,
        position: i,
        thumbnailUrl: `https://laptopid.ee/images/product//${prefix}/${i}/small.png`,
        mediumUrl: `https://laptopid.ee/images/product//${prefix}/${i}/medium.png`,
        largeUrl: `https://laptopid.ee/images/product//${prefix}/${i}/original.png`,
        width: i === count - 1 ? 120 : 1600, // viimane on pisipilt → ei lisata
        height: 1200,
        alt: `${prefix} ${i}`,
      });
    }
  }

  beforeAll(async () => {
    t = await createTestDatabase();
    // Laptopid.ee mudel fotodega (müüdud pakkumine — fotod jäävad andmebaasi)
    const rugged = await model("dell-latitude-14-rugged-5430", "dell", "Latitude", "14 Rugged 5430", 14);
    await photos(await listing(rugged, "laptopid", { available: false, gpu: "Intel Iris Xe Graphics", gpuDedicated: false }), 4, "rugged");
    // Techi mudel teise nimega → kindel vaste
    const techRugged = await model("dell-latitude-5430-rugged", "dell", "Latitude", "5430 Rugged", 14);
    await listing(techRugged, "tech");
    // Foxway mudel, millel on ise Icecati pilt (LOCAL) — ei puututa
    const local = await model("lenovo-thinkpad-t14-gen-3", "lenovo", "ThinkPad", "T14 Gen 3", 14);
    await listing(local, "foxway");
    await t.db.insert(productImages).values({ productModelId: local, source: "ICECAT", type: "MODEL_GENERIC", sourceId: "ic-1", position: 0, isMain: true, thumbnailPath: "/t", mediumPath: "/m", largePath: "/l", width: 800, height: 600, alt: "x" });
    // Ebakindel: 7310 vs Laptopid.ee 7310 Carbon → REVIEW
    const carbon = await model("dell-latitude-7310-carbon", "dell", "Latitude", "7310 Carbon", 13.3);
    await photos(await listing(carbon, "laptopid", { gpu: "Intel UHD Graphics", gpuDedicated: false, cpu: "Intel Core i5-10310U" }), 2, "carbon");
    const plain7310 = await model("dell-latitude-7310", "dell", "Latitude", "7310", 13);
    await listing(plain7310, "tech", { cpu: "Intel Core i5-10310U" });
    // Vasteta + MPN → Icecat; vasteta ilma identifikaatorita → Icecati päringut ei tehta
    const air = await model("apple-macbook-air-13-2020", "apple", "MacBook Air", '13" 2020', 13);
    await listing(air, "foxway", { cpu: "Intel Core i5-1030NG7", rawData: { foxway: { mpn: "MVH22LL/A", productName: "Apple MacBook Air (13\" 2020)" } } });
    const cepter = await model("cepter-cloud", "cepter", "Cloud", "Cloud", 15.6);
    await listing(cepter, "foxway", { cpu: "AMD Ryzen 5 5500U" });
    // GPU: Foxway "Integrated" (NULL + dedicated=false) sama CPU-ga → Laptopid.ee nimi; admini parandusega pakkumist ei puututa
    ids.fxGpu = await listing(local, "foxway", { gpu: null, gpuDedicated: false, cpu: "Intel Core i5-1135G7" });
    ids.fxGpuManual = await listing(local, "foxway", { gpu: null, gpuDedicated: false, cpu: "Intel Core i5-1135G7", manualOverrides: { gpu: "Admini GPU" } });
    ids.fxDedicated = await listing(local, "foxway", { gpu: "NVIDIA GeForce MX450", gpuDedicated: true, cpu: "Intel Core i5-1135G7" });
  }, 120_000);

  afterAll(async () => {
    await t?.cleanup();
  });

  it("kuivkäivitus ei muuda midagi", async () => {
    const { runCatalogEnrichment } = await import("./catalog-enrichment");
    const report = await runCatalogEnrichment(t.db, { images: true, specs: true, dryRun: true });
    expect(report.images!.linkedLaptopidMatched).toBe(1);
    expect(await t.db.select().from(productImages).where(eq(productImages.source, "LAPTOPID"))).toHaveLength(0);
    const [row] = await t.db.select().from(supplierListings).where(eq(supplierListings.id, ids.fxGpu));
    expect(row.enrichment).toBeNull();
  });

  it("prioriteet: meie pildid → Laptopid.ee (sama mudel / kindel vaste) → Icecat ainult vasteta + identifikaatoriga mudelile", async () => {
    const { runCatalogEnrichment } = await import("./catalog-enrichment");
    const { DbImageRepository } = await import("@/server/images/db-image-repository");
    const report = await runCatalogEnrichment(t.db, { images: true, specs: true, icecat: { ...icecat, repository: new DbImageRepository(t.db) } });
    const images = report.images!;

    // LOCAL: Icecati pildiga mudel jääb puutumata
    const localRows = await t.db.select().from(productImages).where(eq(productImages.productModelId, ids["lenovo-thinkpad-t14-gen-3"]));
    expect(localRows.map((r) => r.source)).toEqual(["ICECAT"]);

    // Laptopid.ee: sama mudel ja kindel vaste (pisipilt jäetakse välja)
    for (const slug of ["dell-latitude-14-rugged-5430", "dell-latitude-5430-rugged"]) {
      const rows = await t.db.select().from(productImages).where(eq(productImages.productModelId, ids[slug]));
      expect(rows, slug).toHaveLength(3);
      expect(rows.every((r) => r.source === "LAPTOPID" && r.largePath.startsWith("https://laptopid.ee/"))).toBe(true);
      expect(rows.filter((r) => r.isMain)).toHaveLength(1);
    }
    const [tech] = await t.db.select().from(productModels).where(eq(productModels.id, ids["dell-latitude-5430-rugged"]));
    expect(tech.enrichment?.images).toMatchObject({ status: "LAPTOPID", matchedModelSlug: "dell-latitude-14-rugged-5430" });

    // Ebakindel vaste: pilte ei lisata, REVIEW + kandidaadid
    expect(await t.db.select().from(productImages).where(eq(productImages.productModelId, ids["dell-latitude-7310"]))).toHaveLength(0);
    const [review] = await t.db.select().from(productModels).where(eq(productModels.id, ids["dell-latitude-7310"]));
    expect(review.enrichment?.images).toMatchObject({ status: "REVIEW", candidates: ["dell-latitude-7310-carbon"] });

    // Icecat: ainult MPN-iga vasteta mudel; Laptopid.ee vastega ja identifikaatorita mudelite kohta päringut ei tehtud
    expect(icecatCalls).toEqual(["MVH22LL/A"]);
    expect(images.icecatAttempted).toBe(1);
    expect(images.icecatSkippedNoIdentifiers).toBeGreaterThanOrEqual(1);
    const [cepter] = await t.db.select().from(productModels).where(eq(productModels.id, ids["cepter-cloud"]));
    expect(cepter.enrichment?.images).toMatchObject({ status: "UNRESOLVED", icecat: "NO_IDENTIFIERS" });
    const mpn = await t.db.select().from(productIdentifiers).where(eq(productIdentifiers.productModelId, ids["apple-macbook-air-13-2020"]));
    expect(mpn.map((r) => [r.kind, r.value, r.source])).toEqual([["MPN", "MVH22LL/A", "SUPPLIER"]]);

    // GPU: Laptopid.ee nimi tarnija "Integrated" asemel; admini parandus ja tarnija eraldi GPU puutumata
    const listings = await t.db.select().from(supplierListings);
    const byId = new Map(listings.map((l) => [l.id, l]));
    expect(byId.get(ids.fxGpu)!.enrichment?.gpu).toMatchObject({ value: "Intel Iris Xe Graphics", source: "LAPTOPID" });
    expect(byId.get(ids.fxGpu)!.gpu).toBeNull(); // tarnija veerg jääb samaks
    expect(byId.get(ids.fxGpuManual)!.enrichment).toBeNull();
    expect(byId.get(ids.fxDedicated)!.enrichment).toBeNull();
  });

  it("idempotentne: teine käivitus ei muuda midagi; admini peidetud Laptopid.ee pilti tagasi ei lisata", async () => {
    const { runCatalogEnrichment } = await import("./catalog-enrichment");
    const tech = ids["dell-latitude-5430-rugged"];
    const [first] = await t.db.select().from(productImages).where(eq(productImages.productModelId, tech)).limit(1);
    await t.db.update(productImages).set({ isHidden: true }).where(eq(productImages.id, first.id));
    const before = await t.db.select().from(productImages);

    const report = await runCatalogEnrichment(t.db, { images: true, specs: true });
    expect(report.specs!.changedListings).toBe(0);
    expect(report.images!.linkedLaptopidMatched + report.images!.linkedLaptopidSameModel).toBe(0);
    const after = await t.db.select().from(productImages);
    expect(after).toHaveLength(before.length);
    const [stillHidden] = await t.db.select().from(productImages).where(eq(productImages.id, first.id));
    expect(stillHidden.isHidden).toBe(true);
  });

  it("poe mapper: efektiivne GPU = parandus ?? tarnija ?? rikastus", async () => {
    const { mapCatalogRows } = await import("@/server/catalog/db-catalog-mapper");
    const [models, listings, images, unitImages] = await Promise.all([
      t.db.select().from(productModels),
      t.db.select().from(supplierListings),
      t.db.select().from(productImages),
      t.db.select().from(listingImages),
    ]);
    // Pakkumised on testandmetes ilma RAM/SSD/hinnata → täidame poe kohustuslikud väljad mälus
    const complete = listings.map((l) => ({ ...l, ramGb: 16, storageGb: 512, grade: "A", salePriceCents: 50_000, screenSizeIn: 14 }));
    const { items } = mapCatalogRows(models, complete, images, unitImages);
    const gpuOf = (id: string) => items.find((i) => i.variant.sku === complete.find((l) => l.id === id)!.sku)!.variant.gpu.model;
    expect(gpuOf(ids.fxGpu)).toBe("Intel Iris Xe Graphics");
    expect(gpuOf(ids.fxGpuManual)).toBe("Admini GPU");
    expect(gpuOf(ids.fxDedicated)).toBe("NVIDIA GeForce MX450");
  });
});

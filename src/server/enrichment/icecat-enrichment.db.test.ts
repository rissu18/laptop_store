import { eq } from "drizzle-orm";
import sharp from "sharp";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { createTestDatabase, hasTestDatabase, type TestDatabase } from "@/test/test-db";
import { icecatMetadata, productImages, productModels, supplierListings } from "@/server/db/schema";
import { galleryItem, icecatProduct } from "@/integrations/icecat/icecat-fixtures";
import type { IcecatIndexRow } from "@/integrations/icecat/icecat-index";
import type { IcecatIdentifier, IcecatLookupResult, IcecatProduct } from "@/integrations/icecat/icecat-types";
import type { ImageStorageAdapter } from "@/server/images/storage/image-storage";

/**
 * Icecati rikastus tootja + mudeli identiteedi järgi päris PostgreSQL-is (ajutine skeem), võlts-Icecat + mälus failid:
 * GTIN/MPN-ita mudel leitakse indeksist, admini (MANUAL) pilt jääb esimeseks ja alles, ebakindel vaste pilte ei lisa,
 * 5+ pildiga mudelit ei puututa, korduv käivitus ei dubleeri ega lae uuesti alla, päritolu = ICECAT.
 */

vi.mock("server-only", () => ({}));

const row = (productId: string, supplierId: string, modelName: string): IcecatIndexRow => ({
  productId, supplierId, modelName, prodId: `P${productId}`, catid: "151", quality: "ICECAT", onMarket: true, hasHighPic: true, updated: "20260101000000", limited: false,
});

describe.skipIf(!hasTestDatabase)("Icecati rikastus mudeli identiteedi järgi (andmebaas)", () => {
  let t: TestDatabase;
  const ids: Record<string, string> = {};
  const jsonCalls: string[] = [];
  const downloads: string[] = [];
  const files = new Map<string, Buffer>();

  const products: Record<string, IcecatProduct> = {
    "1001": icecatProduct({ icecatId: "1001", title: "HP EliteBook 840 G7 Notebook PC Intel Core i5-10210U 35.6 cm (14\")", gallery: Array.from({ length: 12 }, (_, i) => galleryItem(String(700 + i), i + 1)) }),
    "2001": icecatProduct({ icecatId: "2001", title: "Lenovo ThinkPad T14 Gen 3 Intel Core i5 35.6 cm (14\")" }),
    "4001": icecatProduct({ icecatId: "4001", title: "HP ProBook 450 G9 Notebook PC Intel Core i5-1235U 39.6 cm (15.6\")", gallery: Array.from({ length: 12 }, (_, i) => galleryItem(String(800 + i), i + 1)) }),
  };
  const index: IcecatIndexRow[] = [
    row("1001", "1", "EliteBook 840 G7 Notebook PC"),
    row("1002", "1", "EliteBook 840 G8 Notebook PC"),
    row("2001", "728", "ThinkPad T14s Gen 3 (Intel)"),
    row("3001", "292", "5430"),
    row("4001", "1", "ProBook 450 G9"),
  ];

  const storage: ImageStorageAdapter = {
    name: "memory",
    async saveImage(input) {
      const key = `${input.productModelId}/${input.fileName}`;
      files.set(key, input.data);
      return { url: `/media/products/${key}`, key, bytes: input.data.length };
    },
    async deleteImage(key) {
      files.delete(key);
    },
  };
  const photos = new Map<string, Promise<Buffer>>();
  const icecatClient = {
    assetHeaders: () => ({}),
    async getProduct(identifier: IcecatIdentifier): Promise<IcecatLookupResult> {
      const key = identifier.kind === "ICECAT_ID" ? identifier.icecatId : identifier.kind;
      jsonCalls.push(key);
      return products[key] ? { status: "FOUND", product: products[key] } : { status: "NOT_FOUND", message: "test" };
    },
  };

  async function options() {
    const { DbImageRepository } = await import("@/server/images/db-image-repository");
    return {
      images: true,
      icecat: {
        icecat: icecatClient,
        storage,
        repository: new DbImageRepository(t.db),
        download: async (url: string) => {
          downloads.push(url);
          const id = url.match(/\/(\w+)\.jpg$/)?.[1] ?? "x";
          if (!photos.has(id)) photos.set(id, sharp({ create: { width: 1200, height: 900, channels: 3, background: { r: Number(id) % 255, g: 80, b: 40 } } }).jpeg().toBuffer());
          return { data: await photos.get(id)!, contentType: "image/jpeg" };
        },
      },
      icecatIndex: async (suppliers: Set<string>, onRow: (r: IcecatIndexRow) => void) => {
        const kept = index.filter((r) => suppliers.has(r.supplierId));
        kept.forEach(onRow);
        return { products: index.length, kept: kept.length };
      },
    };
  }

  async function model(slug: string, manufacturer: string, family: string, name: string) {
    const [created] = await t.db.insert(productModels).values({ slug, manufacturer, family, model: name, screenSizeIn: 14 }).returning({ id: productModels.id });
    ids[slug] = created.id;
    await t.db.insert(supplierListings).values({ productModelId: created.id, supplier: "tech", supplierProductId: slug, sku: `SKU-${slug}`, available: true, stock: 1, cpu: "Intel Core i5-10210U" });
    return created.id;
  }
  const image = (productModelId: string, source: "MANUAL" | "ICECAT", sourceId: string, position: number) => ({
    productModelId, source, type: "MODEL_GENERIC" as const, sourceId, position, isMain: position === 0, thumbnailPath: `/t/${sourceId}`, mediumPath: `/m/${sourceId}`, largePath: `/l/${sourceId}`, width: 1200, height: 900, alt: sourceId,
  });

  beforeAll(async () => {
    t = await createTestDatabase();
    // GTIN/MPN puudub; admin on lisanud ühe oma pildi
    const hp = await model("hp-elitebook-840-g7", "hp", "EliteBook", "840 G7");
    await t.db.insert(productImages).values(image(hp, "MANUAL", "admin-1", 0));
    // Icecati pealkiri on teine mudel (T14 ≠ T14s) → ülevaatus
    await model("lenovo-thinkpad-t14s-gen-3", "lenovo", "ThinkPad", "T14s Gen 3");
    // Galerii juba täis (5 pilti) → ei puututa
    const full = await model("dell-latitude-5430", "dell", "Latitude", "5430");
    for (let i = 0; i < 5; i++) await t.db.insert(productImages).values(image(full, "ICECAT", `old-${i}`, i));
    // Regressioon: 10 pildirida, aga need on 2 foto koopiad (Laptopid.ee sama foto eri pakkumistel) → 2 unikaalset → kandidaat
    const copies = await model("hp-probook-450-g9", "hp", "ProBook", "450 G9");
    await t.db.update(productModels).set({ screenSizeIn: 15.6 }).where(eq(productModels.id, copies));
    for (let i = 0; i < 10; i++) {
      await t.db.insert(productImages).values({ ...image(copies, "MANUAL", `copy-${i}`, i), source: "LAPTOPID", visualHash: i % 2 ? "ffffffffffffffff" : "0000000000000000", imageQuality: "OK" });
    }
  }, 120_000);

  afterAll(async () => {
    await t?.cleanup();
  });

  it("dry-run: indeks + andmelehed, aga faile ega andmebaasi ei muudeta", async () => {
    const { runCatalogEnrichment } = await import("./catalog-enrichment");
    const report = await runCatalogEnrichment(t.db, { ...(await options()), dryRun: true });
    expect(report.images!.icecat).toMatchObject({ candidates: 3, nameExact: 2, review: 1 });
    // 10 rida, 2 unikaalset pilti → kandidaat; Icecati ülempiir = 10 − 2 unikaalset muud pilti
    expect(report.images!.icecat!.results.find((r) => r.model === "hp-probook-450-g9")).toMatchObject({ outcome: "NAME_EXACT", imagesBefore: 2, icecatImages: 8 });
    expect(downloads).toHaveLength(0);
    expect(await t.db.select().from(icecatMetadata)).toHaveLength(0);
    jsonCalls.length = 0;
  });

  it("GTIN/MPN-ita mudel saab Icecati pildid nime järgi (max 10 kokku), admini pilt jääb esimeseks; ebakindel vaste pilte ei lisa", async () => {
    const { runCatalogEnrichment } = await import("./catalog-enrichment");
    const report = await runCatalogEnrichment(t.db, await options());
    const ic = report.images!.icecat!;
    expect(ic).toMatchObject({ candidates: 3, nameExact: 2, review: 1, identifierMatches: 0 });
    const probook = await t.db.select().from(productImages).where(eq(productImages.productModelId, ids["hp-probook-450-g9"]));
    expect(probook.filter((r) => r.source === "ICECAT")).toHaveLength(8);
    expect(probook.filter((r) => r.source === "LAPTOPID")).toHaveLength(10); // olemasolevad read jäävad
    expect(jsonCalls).not.toContain("3001"); // täis galeriiga mudelit ei küsita

    const hpImages = await t.db.select().from(productImages).where(eq(productImages.productModelId, ids["hp-elitebook-840-g7"]));
    const sorted = [...hpImages].sort((a, b) => a.position - b.position);
    expect(sorted).toHaveLength(10); // 1 admini + 9 Icecati (12 pakuti)
    expect(sorted[0]).toMatchObject({ source: "MANUAL", sourceId: "admin-1", isMain: true });
    expect(sorted.slice(1).every((r) => r.source === "ICECAT" && r.largePath.startsWith("/media/products/"))).toBe(true);
    const [hpMeta] = await t.db.select().from(icecatMetadata).where(eq(icecatMetadata.productModelId, ids["hp-elitebook-840-g7"]));
    expect(hpMeta).toMatchObject({ status: "MATCHED", matchType: "MODEL_IDENTITY", icecatId: "1001", titleVerified: true });
    const [hpModel] = await t.db.select().from(productModels).where(eq(productModels.id, ids["hp-elitebook-840-g7"]));
    expect(hpModel.enrichment?.images).toMatchObject({ icecat: "MATCHED", imageCount: 10 });

    expect(await t.db.select().from(productImages).where(eq(productImages.productModelId, ids["lenovo-thinkpad-t14s-gen-3"]))).toHaveLength(0);
    const [review] = await t.db.select().from(icecatMetadata).where(eq(icecatMetadata.productModelId, ids["lenovo-thinkpad-t14s-gen-3"]));
    expect(review).toMatchObject({ status: "NEEDS_REVIEW", icecatId: "2001" });

    const full = await t.db.select().from(productImages).where(eq(productImages.productModelId, ids["dell-latitude-5430"]));
    expect(full.map((r) => r.sourceId).sort()).toEqual(["old-0", "old-1", "old-2", "old-3", "old-4"]);
  });

  it("teine käivitus: midagi alla ei laadita ega dubleerita (varasem vaste, 1 päring)", async () => {
    const { runCatalogEnrichment } = await import("./catalog-enrichment");
    const before = await t.db.select().from(productImages);
    const downloadsBefore = downloads.length;
    await runCatalogEnrichment(t.db, await options());
    const after = await t.db.select().from(productImages);
    expect(downloads.length).toBe(downloadsBefore);
    expect(after.map((r) => r.id).sort()).toEqual(before.map((r) => r.id).sort());
    const [manual] = after.filter((r) => r.source === "MANUAL");
    expect(manual).toMatchObject({ sourceId: "admin-1", isMain: true, position: 0 });
  });

  it("ühe pildiga varasem vaste → sama mudeli identiteediga parema galeriiga SKU; teise mudeli suurem galerii ei loe", async () => {
    const { runCatalogEnrichment } = await import("./catalog-enrichment");
    const title = (name: string) => `HP EliteBook ${name} Notebook PC Intel Core i5-10210U`;
    products["5001"] = icecatProduct({ icecatId: "5001", title: title("850 G7"), gallery: [galleryItem("901", 1)] });
    products["5002"] = icecatProduct({ icecatId: "5002", title: title("850 G7"), gallery: Array.from({ length: 8 }, (_, i) => galleryItem(String(910 + i * 20), i + 1)) });
    products["5003"] = icecatProduct({ icecatId: "5003", title: title("850 G8"), gallery: Array.from({ length: 12 }, (_, i) => galleryItem(String(930 + i), i + 1)) });
    await model("hp-elitebook-850-g7", "hp", "EliteBook", "850 G7");
    index.push(row("5001", "1", "EliteBook 850 G7 Notebook PC"));
    await runCatalogEnrichment(t.db, await options());
    const [first] = await t.db.select().from(icecatMetadata).where(eq(icecatMetadata.productModelId, ids["hp-elitebook-850-g7"]));
    expect(first).toMatchObject({ status: "MATCHED", icecatId: "5001", imageCount: 1 });

    // Indeksis on nüüd sama mudeli teine SKU (8 pilti) ja teine mudel (850 G8, 12 pilti)
    index.push(row("5002", "1", "EliteBook 850 G7"), row("5003", "1", "EliteBook 850 G8"));
    const report = await runCatalogEnrichment(t.db, await options());
    expect(report.images!.icecat).toMatchObject({ upgraded: 1 });
    expect(report.images!.icecat!.results.find((r) => r.model === "hp-elitebook-850-g7")).toMatchObject({ outcome: "UPGRADED", icecatId: "5002" });
    const [after] = await t.db.select().from(icecatMetadata).where(eq(icecatMetadata.productModelId, ids["hp-elitebook-850-g7"]));
    expect(after).toMatchObject({ status: "MATCHED", icecatId: "5002", imageCount: 8 });
    expect(after.matchedBy).toContain("asendas #5001 (1 pilti)");
    const images = await t.db.select().from(productImages).where(eq(productImages.productModelId, ids["hp-elitebook-850-g7"]));
    expect(images.filter((r) => r.source === "ICECAT")).toHaveLength(8); // vana 1 pilt asendati, mitte lisati
  });
}, 120_000);

import sharp from "sharp";
import { beforeAll, describe, expect, it } from "vitest";
import type { IcecatMatchRecord } from "@/domain/images/icecat-match";
import type { ProductImageRecord } from "@/domain/images/product-image";
import { galleryItem, icecatProduct } from "@/integrations/icecat/icecat-fixtures";
import type { IcecatLookupResult, IcecatProduct } from "@/integrations/icecat/icecat-types";
import { importIcecatProduct, importModelImages, type ImportDependencies } from "./icecat-image-import";
import type { ProductImageRepository } from "./image-repository";
import type { ImageStorageAdapter } from "./storage/image-storage";

/**
 * Integratsioonitest: kogu pipeline (vaste → pildid → töötlus → salvestus → kirjed)
 * võlts-Icecati, mälus salvestusruumi ja mälus hoidlaga. Võrku ei minda.
 */

const model = { id: "dell-latitude-5420", title: "Dell Latitude 5420", brandName: "Dell", modelName: "Latitude 5420" };
const ids = { gtins: [], mpns: ["5420-0457"], icecatIds: [] };
let photo: Buffer;

beforeAll(async () => {
  photo = await sharp({ create: { width: 1200, height: 1200, channels: 3, background: "#ffffff" } }).jpeg().toBuffer();
});

/** Iga Icecati pildi ID annab erineva faili (et duplikaatide eemaldus neid kokku ei võtaks). */
const photoCache = new Map<string, Promise<Buffer>>();
function distinctPhoto(url: string): Promise<Buffer> {
  const id = url.match(/\/(\w+)\.jpg$/)?.[1] ?? "x";
  if (!photoCache.has(id)) {
    const shade = [...id].reduce((sum, ch) => sum + ch.charCodeAt(0) * 7, 0) % 200;
    photoCache.set(id, sharp({ create: { width: 1200, height: 1200, channels: 3, background: { r: shade, g: 100, b: 50 } } }).jpeg().toBuffer());
  }
  return photoCache.get(id)!;
}

function setup(initialProduct: IcecatProduct | null) {
  let product = initialProduct;
  let icecatDown = false;
  const files = new Map<string, Buffer>();
  const downloads: string[] = [];
  const images = new Map<string, ProductImageRecord[]>();
  const matches = new Map<string, IcecatMatchRecord>();

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

  const repository: ProductImageRepository = {
    async listImages(id) {
      return images.get(id) ?? [];
    },
    async replaceImages(id, records) {
      images.set(id, records);
    },
    async setImageHidden(id, sourceId, hidden) {
      const target = (images.get(id) ?? []).find((r) => r.sourceId === sourceId);
      if (target) target.isHidden = hidden;
      return Boolean(target);
    },
    async listAllImages() {
      return Object.fromEntries(images);
    },
    async getMatch(id) {
      return matches.get(id) ?? null;
    },
    async saveMatch(record) {
      matches.set(record.productModelId, record);
    },
    async listMatches() {
      return [...matches.values()];
    },
  };

  const deps: ImportDependencies = {
    storage,
    repository,
    icecat: {
      assetHeaders: () => ({}),
      async getProduct(): Promise<IcecatLookupResult> {
        if (icecatDown) return { status: "ERROR", message: "HTTP 503" };
        return product ? { status: "FOUND", product } : { status: "NOT_FOUND", message: "not found" };
      },
    },
    download: async (url) => {
      downloads.push(url);
      if (url.includes("broken")) return { data: Buffer.from("<html>error</html>"), contentType: "text/html" };
      return { data: await distinctPhoto(url), contentType: "image/jpeg" };
    },
    now: () => new Date("2026-10-10T12:00:00Z"),
  };

  return {
    deps,
    files,
    downloads,
    images,
    matches,
    setProduct: (p: IcecatProduct | null) => (product = p),
    setIcecatDown: (down: boolean) => (icecatDown = down),
  };
}

describe("importModelImages", () => {
  it("salvestab põhipildi ja galerii kolmes variandis ning frontend saab ainult meie URL-id", async () => {
    const env = setup(icecatProduct());
    const report = await importModelImages(model, ids, env.deps);

    expect(report.status).toBe("MATCHED");
    expect(report.hasMainImage).toBe(true);
    expect(report.galleryCount).toBe(2);
    const records = env.images.get(model.id)!;
    expect(records).toHaveLength(3);
    expect(records[0]).toMatchObject({ isMain: true, source: "ICECAT", type: "MODEL_GENERIC", alt: "Dell Latitude 5420 sülearvuti" });
    for (const record of records) {
      for (const url of [record.thumbnailUrl, record.mediumUrl, record.largeUrl]) expect(url).toMatch(/^\/media\/products\//);
    }
    expect(env.files.has("dell-latitude-5420/dell-latitude-5420-01-thumb.webp")).toBe(true);
    expect(env.matches.get(model.id)).toMatchObject({ status: "MATCHED", matchType: "MPN", imageCount: 3 });
  });

  it("teisel käivitusel ei laadita muutumata pilte uuesti alla", async () => {
    const env = setup(icecatProduct());
    await importModelImages(model, ids, env.deps);
    const firstRun = env.downloads.length;

    const report = await importModelImages(model, ids, env.deps);
    expect(env.downloads.length).toBe(firstRun);
    expect(report.unchanged).toBe(3);
    expect(report.downloaded).toBe(0);
  });

  it("galerii muutumisel uuendatakse ainult muutunud pilt ja eemaldatakse kadunud pilt", async () => {
    const env = setup(icecatProduct());
    await importModelImages(model, ids, env.deps);

    env.setProduct(
      icecatProduct({ gallery: [galleryItem("100", 1), galleryItem("101", 2, { Updated: "2025-01-01 00:00:00" })] }),
    );
    const report = await importModelImages(model, ids, env.deps);

    expect(report.unchanged).toBe(1);
    expect(report.downloaded).toBe(1);
    expect(report.removed).toBe(1);
    expect(env.images.get(model.id)!.map((r) => r.sourceId)).toEqual(["100", "101"]);
    expect(env.files.has("dell-latitude-5420/dell-latitude-5420-03-large.webp")).toBe(false);
  });

  it("vale mudeli vaste → NEEDS_REVIEW ja pilte live'i ei panda", async () => {
    const env = setup(icecatProduct({ title: "DELL Latitude 7420 Intel® Core™ i7" }));
    const report = await importModelImages(model, ids, env.deps);
    expect(report.status).toBe("NEEDS_REVIEW");
    expect(env.images.get(model.id) ?? []).toHaveLength(0);
    expect(env.downloads).toHaveLength(0);
  });

  it("Icecat maas → staatus ERROR, olemasolevad pildid jäävad alles", async () => {
    const env = setup(icecatProduct());
    await importModelImages(model, ids, env.deps);
    env.setIcecatDown(true);

    const report = await importModelImages(model, ids, env.deps, { rematch: true });
    expect(report).toMatchObject({ status: "ERROR", reason: "ICECAT_UNAVAILABLE", imageCount: 3 });
    expect(env.images.get(model.id)).toHaveLength(3);
    expect(env.matches.get(model.id)?.status).toBe("ERROR");
  });

  it("admini peidetud pilt jääb peidetuks ka pärast uuesti allalaadimist ja põhipilt liigub edasi", async () => {
    const env = setup(icecatProduct());
    await importModelImages(model, ids, env.deps);
    await env.deps.repository.setImageHidden(model.id, "100", true);

    const report = await importModelImages(model, ids, env.deps, { force: true });
    const records = env.images.get(model.id)!;
    expect(records.find((r) => r.sourceId === "100")?.isHidden).toBe(true);
    expect(records.find((r) => r.isMain)?.sourceId).toBe("101");
    expect(report).toMatchObject({ imageCount: 2, hidden: 1, galleryCount: 1 });
  });

  it("eemaldab täpsed duplikaadid (sama faili sisu erineva ID ja URL-iga)", async () => {
    const env = setup(icecatProduct());
    const other = await sharp({ create: { width: 1200, height: 1200, channels: 3, background: "#000000" } }).jpeg().toBuffer();
    // 100 ja 101 tagastavad sama faili; 102 on erinev
    env.deps.download = async (url) => ({ data: url.includes("102") ? other : photo, contentType: "image/jpeg" });
    const report = await importModelImages(model, ids, env.deps);
    expect(report.duplicates).toBe(1);
    expect(env.images.get(model.id)!.map((r) => r.sourceId)).toEqual(["100", "102"]);
    expect([...env.files.keys()].some((key) => key.includes("-02-"))).toBe(false);
  });

  it("katkine pildifail lükatakse tagasi, ülejäänud pildid salvestatakse", async () => {
    const broken = galleryItem("102", 3, {
      Pic: "https://images.icecat.biz/img/gallery/broken.jpg",
      Pic500x500: "https://images.icecat.biz/img/gallery_mediums/broken.jpg",
    });
    const env = setup(icecatProduct({ gallery: [galleryItem("100", 1), galleryItem("101", 2), broken] }));
    const report = await importModelImages(model, ids, env.deps);
    expect(report.status).toBe("MATCHED");
    expect(report.failed).toBe(1);
    expect(env.images.get(model.id)).toHaveLength(2);
  });

  it("kõigi piltide ebaõnnestumisel → ERROR (DOWNLOAD_FAILED)", async () => {
    const env = setup(icecatProduct());
    env.deps.download = async () => ({ data: Buffer.from("nope"), contentType: "image/jpeg" });
    const report = await importModelImages(model, ids, env.deps);
    expect(report).toMatchObject({ status: "ERROR", reason: "DOWNLOAD_FAILED" });
  });

  it("Icecati andmetest võetakse ainult pildid — tehnilisi andmeid kirjetes pole", async () => {
    const env = setup(icecatProduct({ title: "DELL Latitude 5420 Intel® Core™ i7 32 GB German keyboard Touchscreen" }));
    await importModelImages(model, ids, env.deps);
    const record = env.images.get(model.id)![0] as unknown as Record<string, unknown>;
    for (const field of ["ram", "ramGb", "cpu", "keyboard", "keyboardLayout", "touch", "storageGb"]) expect(record).not.toHaveProperty(field);
  });
});

/** Mustriga foto (mitte ühtlane) — visuaalse räsi testideks */
function patterned(seed: number, width = 1200, height = 900): Promise<Buffer> {
  const bars = Array.from({ length: 6 }, (_, i) => `<rect x="${i * (width / 6)}" y="0" width="${width / 12}" height="${height}" fill="rgb(${(seed * 37 + i * 40) % 255},${(seed * 91) % 255},${(i * 60) % 255})"/>`).join("");
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><rect width="100%" height="100%" fill="#fff"/>${bars}<circle cx="${(seed * 97) % width}" cy="${(seed * 53) % height}" r="${120 + seed * 7}" fill="#123"/></svg>`;
  return sharp(Buffer.from(svg)).jpeg().toBuffer();
}

describe("importIcecatProduct (mudeli identiteedi vaste)", () => {
  const match = (product: IcecatProduct) => ({ product, matchType: "MODEL_IDENTITY" as const, confidence: 0.92, matchedBy: "Icecat mudelinimi", titleVerified: true });
  const galleryOf = (n: number) => Array.from({ length: n }, (_, i) => galleryItem(String(200 + i), i + 1));

  it.each([
    [12, 10],
    [7, 7],
    [3, 3],
  ])("Icecat annab %i head pilti → salvestatakse %i (max 10, kunstlikult ei korrata)", async (given, stored) => {
    const env = setup(null);
    const report = await importIcecatProduct(model, match(icecatProduct({ gallery: galleryOf(given) })), env.deps);
    expect(report).toMatchObject({ status: "MATCHED", imageCount: stored, matchType: "MODEL_IDENTITY" });
    const records = env.images.get(model.id)!;
    expect(records).toHaveLength(stored);
    expect(new Set(records.map((r) => r.sourceId)).size).toBe(stored);
    expect(records.every((r) => r.source === "ICECAT")).toBe(true);
    expect(env.matches.get(model.id)).toMatchObject({ status: "MATCHED", matchType: "MODEL_IDENTITY", titleVerified: true, imageCount: stored });
  });

  it("sama pildi väike/keskmine/suur variant → üks galeriipilt suurimast allikast", async () => {
    const env = setup(null);
    await importIcecatProduct(model, match(icecatProduct({ gallery: [galleryItem("300", 1)] })), env.deps);
    const [record] = env.images.get(model.id)!;
    expect(env.images.get(model.id)).toHaveLength(1);
    expect(record.originalSourceUrl).toBe("https://images.icecat.biz/img/gallery/300.jpg");
  });

  it("visuaalselt sama foto (teine suurus + valge ääris) jäetakse välja", async () => {
    const env = setup(null);
    const a = await patterned(1);
    const aSmallPadded = await sharp(await sharp(a).resize(600, 450).toBuffer())
      .extend({ top: 175, bottom: 175, left: 100, right: 100, background: "#ffffff" })
      .jpeg({ quality: 70 })
      .toBuffer();
    const b = await patterned(5);
    env.deps.download = async (url) => ({ data: url.includes("401") ? aSmallPadded : url.includes("402") ? b : a, contentType: "image/jpeg" });
    const report = await importIcecatProduct(model, match(icecatProduct({ gallery: [galleryItem("400", 1), galleryItem("401", 2), galleryItem("402", 3)] })), env.deps);
    expect(report.duplicates).toBe(1);
    expect(env.images.get(model.id)!.map((r) => r.sourceId)).toEqual(["400", "402"]);
  }, 30_000);

  it("galerii täiendamine: Icecati pildid tulevad teiste allikate järel (positionOffset) ja maxImages piirab", async () => {
    const env = setup(null);
    await importIcecatProduct(model, match(icecatProduct({ gallery: galleryOf(8) })), env.deps, { maxImages: 6, positionOffset: 2 });
    const records = env.images.get(model.id)!;
    expect(records).toHaveLength(6);
    expect(records.map((r) => r.position)).toEqual([2, 3, 4, 5, 6, 7]);
    expect(records.some((r) => r.isMain)).toBe(false); // põhipilt jääb olemasolevale (nt Laptopid.ee) pildile
  });

  it("korduv käivitus ei lae alla ega dubleeri", async () => {
    const env = setup(null);
    const product = icecatProduct({ gallery: galleryOf(5) });
    await importIcecatProduct(model, match(product), env.deps);
    const downloads = env.downloads.length;
    const second = await importIcecatProduct(model, match(product), env.deps);
    expect(env.downloads.length).toBe(downloads);
    expect(second).toMatchObject({ downloaded: 0, unchanged: 5, imageCount: 5 });
    expect(env.images.get(model.id)).toHaveLength(5);
  });
});

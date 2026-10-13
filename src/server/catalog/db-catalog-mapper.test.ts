import { describe, expect, it } from "vitest";
import type { productImages, productModels, supplierListings } from "@/server/db/schema";
import { defaultConfiguration, sortConfigurations } from "@/domain/catalog/configuration-order";
import { mapCatalogRows } from "./db-catalog-mapper";

type ModelRow = typeof productModels.$inferSelect;
type ListingRow = typeof supplierListings.$inferSelect;
type ImageRow = typeof productImages.$inferSelect;

const now = new Date("2026-10-01T00:00:00Z");

function model(over: Partial<ModelRow> = {}): ModelRow {
  return {
    id: "m1", slug: "lenovo-thinkpad-t14-gen-3", manufacturer: "lenovo", family: "ThinkPad T", model: "T14 Gen 3", generation: "Gen 3",
    screenSizeIn: 14, weightKg: 1.3, usbAPorts: 2, usbCPorts: 2, wifi: "Wi-Fi 6", bluetooth: "5.2", description: null,
    featured: false, status: "ACTIVE", manualOverrides: {}, createdAt: now, updatedAt: now, ...over,
  } as ModelRow;
}

function listing(over: Partial<ListingRow> = {}): ListingRow {
  return {
    id: "l1", productModelId: "m1", supplier: "mock", supplierSku: "MS-1", supplierProductId: "MS-1", sku: "SP-1",
    cpu: "Intel Core i5-1245U", cpuFamily: "intel-core-i5", cpuGeneration: "intel-12", ramGb: 16, ramType: "DDR4", storageGb: 512,
    gpu: "Intel Iris Xe", gpuDedicated: false, screenSizeIn: 14, resolution: "1920x1200", resolutionLabel: "WUXGA", panel: "IPS",
    touchscreen: false, keyboard: "EST", grade: "A", features: { backlitKeyboard: true }, operatingSystem: null, warrantyMonths: null,
    batteryHealthPct: null, chargerIncluded: null, stock: 3, deliveryMinDays: 2, deliveryMaxDays: 4, supplierPriceCents: 30000,
    vatScheme: "MARGIN", salePriceCents: 42900, referencePriceCents: null, status: "ACTIVE", manualOverrides: {}, rawData: null,
    firstSeenAt: now, lastSyncedAt: null, createdAt: now, updatedAt: now, ...over,
  } as ListingRow;
}

function image(over: Partial<ImageRow> = {}): ImageRow {
  return {
    id: "i1", productModelId: "m1", source: "ICECAT", type: "MAIN", sourceId: "1", position: 0, isMain: true, isHidden: false,
    thumbnailPath: "/t.webp", mediumPath: "/m.webp", largePath: "/l.webp", width: 800, height: 600, alt: "T14", originalSourceUrl: null,
    sourceUpdatedAt: null, contentHash: null, storageKeys: null, downloadedAt: null, createdAt: now, updatedAt: now, ...over,
  } as ImageRow;
}

describe("mapCatalogRows", () => {
  it("teisendab aktiivse pakkumise poe kirjeks avaliku ID-ga", () => {
    const { items, incomplete } = mapCatalogRows([model()], [listing()], [image()]);
    expect(incomplete).toEqual([]);
    expect(items).toHaveLength(1);
    expect(items[0].variant.id).toBe("mock-ms-1");
    expect(items[0].variant.price.saleCents).toBe(42900);
    expect(items[0].product.images).toHaveLength(1);
    // Puuduvaid tarnija väärtusi ei asendata vaikeväärtustega
    expect(items[0].variant.warrantyMonths).toBeNull();
    expect(items[0].variant.batteryHealthPct).toBeNull();
  });

  it("kasutab admini parandust (efektiivne väärtus), aga tarnija väärtus jääb alles", () => {
    const row = listing({ ramGb: 8, manualOverrides: { ramGb: 16, keyboard: "US" } });
    const { items } = mapCatalogRows([model()], [row], []);
    expect(items[0].variant.ramGb).toBe(16);
    expect(items[0].variant.keyboardLayout).toBe("US");
    expect(row.ramGb).toBe(8);
  });

  it("ei näita peidetud/arhiveeritud mudeleid, pakkumisi ega tühja laoseisu", () => {
    expect(mapCatalogRows([model({ status: "HIDDEN" })], [listing()], []).items).toHaveLength(0);
    expect(mapCatalogRows([model()], [listing({ status: "ARCHIVED" })], []).items).toHaveLength(0);
    expect(mapCatalogRows([model()], [listing({ stock: 0 })], []).items).toHaveLength(0);
    expect(mapCatalogRows([model()], [listing({ stock: 5, manualOverrides: { stock: 0 } })], []).items).toHaveLength(0);
  });

  it("jätab puudulikud pakkumised poest välja ja raporteerib need", () => {
    const { items, incomplete } = mapCatalogRows([model()], [listing({ cpu: null, salePriceCents: null })], []);
    expect(items).toHaveLength(0);
    expect(incomplete).toEqual([{ sku: "SP-1", missing: ["cpu", "salePrice"] }]);
  });

  it("peidetud pildid ei jõua poodi ja järjekord tuleb positsioonist", () => {
    const { items } = mapCatalogRows(
      [model()],
      [listing()],
      [image({ id: "b", position: 1, mediumPath: "/b.webp", largePath: "/b-large.webp" }), image({ id: "a", position: 0, mediumPath: "/a.webp", largePath: "/a-large.webp" }), image({ id: "h", position: 2, isHidden: true })],
    );
    expect(items[0].product.images.map((i) => i.mediumUrl)).toEqual(["/a.webp", "/b.webp"]);
  });

  it("koondgalerii: sama mudeli kõik konfiguratsioonid näevad sama galeriid (Laptopid.ee fotod eri pakkumistelt + Icecat, dedupe, tühjad välja)", () => {
    const listingImage = (supplierListingId: string, n: number, over: Record<string, unknown> = {}) => ({
      supplierListingId, position: n, isHidden: false, thumbnailUrl: `https://laptopid.ee/${supplierListingId}/${n}/small.png`, mediumUrl: `https://laptopid.ee/${supplierListingId}/${n}/medium.png`,
      largeUrl: `https://laptopid.ee/${supplierListingId}/${n}/original.png`, width: 1600, height: 1200, alt: "x", visualHash: null, imageQuality: "OK" as const, ...over,
    });
    const { items } = mapCatalogRows(
      [model()],
      [listing({ id: "lp1", supplier: "laptopid", supplierProductId: "1", sku: "LP-1" }), listing({ id: "lp2", supplier: "laptopid", supplierProductId: "2", sku: "LP-2" }), listing({ id: "fx", supplier: "foxway", supplierProductId: "F1", sku: "FX-1" })],
      [image({ id: "ic", largePath: "/icecat-1.webp", position: 0 }), image({ id: "ph", source: "PLACEHOLDER", type: "PLACEHOLDER", largePath: "/placeholder.webp", position: 1 })],
      [
        listingImage("lp1", 0),
        listingImage("lp2", 0),
        listingImage("lp2", 1),
        listingImage("lp2", 2, { visualHash: "00000000000000ff" }),
        listingImage("lp1", 1, { visualHash: "00000000000000fe" }), // visuaalselt sama mis lp2/2
        listingImage("lp1", 2, { imageQuality: "BLANK" }),
      ],
    );
    const galleries = items.map((i) => i.product.images.map((img) => img.largeUrl));
    expect(items).toHaveLength(3);
    // Laptopid.ee pakkumised: rohkem fotosid → pakkumise ID (võrdne arv → lp1 enne lp2); lp2/2 = lp1/1 (räsi), lp1/2 tühi
    expect(galleries[0]).toEqual([
      "https://laptopid.ee/lp1/0/original.png",
      "https://laptopid.ee/lp1/1/original.png",
      "https://laptopid.ee/lp2/0/original.png",
      "https://laptopid.ee/lp2/1/original.png",
      "/icecat-1.webp",
    ]);
    expect(galleries[1]).toEqual(galleries[0]);
    expect(galleries[2]).toEqual(galleries[0]); // Foxway konfiguratsioonil sama galerii
    expect(items.every((i) => i.variant.images.length === 0)).toBe(true);
  });

  it("kliendi hind on täisarv eurodes (tavaline ümardamine)", () => {
    const { items } = mapCatalogRows([model()], [listing({ salePriceCents: 75812, referencePriceCents: 99950 })], []);
    expect(items[0].variant.price).toMatchObject({ saleCents: 75800, referenceCents: 100000 });
  });

  it("esiletõstmine tuleb mudelilt", () => {
    const { items } = mapCatalogRows([model({ featured: true })], [listing(), listing({ id: "l2", supplierProductId: "MS-2", sku: "SP-2" })], []);
    expect(items.every((i) => i.variant.isFeatured)).toBe(true);
  });

  it("konfiguratsioonide järjestus: mitteaktiivne / BLOCKED / REVIEW / otsas pakkumine ei osale järjestuses ega vaikevalikus", () => {
    const row = (n: number, euros: number, over: Partial<ListingRow>) =>
      listing({ id: `l${n}`, supplierProductId: `MS-${n}`, sku: `SP-${n}`, salePriceCents: euros * 100, ...over });
    // Salongi variant: kogus teadmata, tarneaega pole
    const local = { stock: null, available: true, deliveryMinDays: null, deliveryMaxDays: null };
    const rows = [
      row(1, 282, {}),
      row(2, 438, { deliveryMinDays: 1, deliveryMaxDays: 2 }),
      row(3, 620, local),
      row(4, 590, local),
      row(5, 100, { ...local, status: "ARCHIVED" }),
      row(6, 150, { ...local, qualityHold: "BLOCKED" }),
      row(7, 160, { qualityHold: "REVIEW" }),
      row(8, 170, { ...local, available: false }),
      row(9, 180, { stock: 0 }),
    ];
    const variants = mapCatalogRows([model()], rows, []).items.map((i) => i.variant);
    expect(sortConfigurations(variants).map((v) => v.sku)).toEqual(["SP-4", "SP-3", "SP-1", "SP-2"]);
    expect(defaultConfiguration(variants)?.sku).toBe("SP-4");
  });
});

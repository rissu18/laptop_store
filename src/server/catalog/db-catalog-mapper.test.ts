import { describe, expect, it } from "vitest";
import type { productImages, productModels, supplierListings } from "@/server/db/schema";
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
      [image({ id: "b", position: 1, mediumPath: "/b.webp" }), image({ id: "a", position: 0, mediumPath: "/a.webp" }), image({ id: "h", position: 2, isHidden: true })],
    );
    expect(items[0].product.images.map((i) => i.mediumUrl)).toEqual(["/a.webp", "/b.webp"]);
  });

  it("esiletõstmine tuleb mudelilt", () => {
    const { items } = mapCatalogRows([model({ featured: true })], [listing(), listing({ id: "l2", supplierProductId: "MS-2", sku: "SP-2" })], []);
    expect(items.every((i) => i.variant.isFeatured)).toBe(true);
  });
});

import { describe, expect, it } from "vitest";
import type { productModels, supplierListings } from "@/server/db/schema";
import { explainVisibility, storefrontHref } from "@/domain/admin/visibility";
import { describeVisibility } from "@/server/admin/sellable";
import { effectiveModel, mapCatalogRows, storefrontVisibility } from "./db-catalog-mapper";

type ModelRow = typeof productModels.$inferSelect;
type ListingRow = typeof supplierListings.$inferSelect;

const now = new Date("2026-10-01T00:00:00Z");

const model = (over: Partial<ModelRow> = {}): ModelRow =>
  ({
    id: "m1", slug: "lenovo-thinkpad-t14-gen-3", manufacturer: "lenovo", family: "ThinkPad T", model: "T14 Gen 3", generation: "Gen 3",
    screenSizeIn: 14, weightKg: 1.3, usbAPorts: 2, usbCPorts: 2, wifi: null, bluetooth: null, description: null,
    featured: false, status: "ACTIVE", manualOverrides: {}, createdAt: now, updatedAt: now, ...over,
  }) as ModelRow;

const listing = (over: Partial<ListingRow> = {}): ListingRow =>
  ({
    id: "l1", productModelId: "m1", supplier: "foxway", supplierSku: "FX-1", supplierProductId: "FX-1", sku: "FX-1",
    cpu: "Intel Core i5-1245U", cpuFamily: "intel-core-i5", cpuGeneration: "intel-12", ramGb: 16, ramType: null, storageGb: 512,
    gpu: null, gpuDedicated: false, screenSizeIn: 14, resolution: null, resolutionLabel: null, panel: null,
    touchscreen: null, keyboard: "SCA", grade: "A", features: {}, operatingSystem: null, warrantyMonths: null,
    batteryHealthPct: null, chargerIncluded: null, stock: 3, available: true, deliveryMinDays: 2, deliveryMaxDays: 4, supplierPriceCents: 30000,
    vatScheme: "STANDARD", salePriceCents: 42949, referencePriceCents: null, status: "ACTIVE", manualOverrides: {}, rawData: null,
    qualityHold: null, qualityHoldReason: null, details: {}, enrichment: null, priceSource: "SUPPLIER",
    firstSeenAt: now, lastSyncedAt: null, createdAt: now, updatedAt: now, ...over,
  }) as ListingRow;

const check = (m: ModelRow, l: ListingRow) => storefrontVisibility(effectiveModel(m), l);
const explain = (m: ModelRow, l: ListingRow) => describeVisibility(l, m, check(m, l));

describe("storefrontVisibility — üks reegel poele ja adminile", () => {
  it("nähtav pakkumine: kõik tingimused täidetud", () => {
    const v = check(model(), listing());
    expect(v.visible).toBe(true);
    expect(v.blockedBy).toBeNull();
    expect(Object.values(v.checks).every(Boolean)).toBe(true);
    expect(explain(model(), listing()).reason).toBeNull();
    expect(explain(model(), listing()).deliveryLabel).toBe("Tarne 2–4 päeva");
  });

  it("vastab poe mapperile: nähtav ⇔ mapCatalogRows annab kirje", () => {
    const cases = [listing(), listing({ status: "HIDDEN" }), listing({ qualityHold: "BLOCKED" }), listing({ stock: 0 }), listing({ cpu: null })];
    for (const row of cases) {
      const { items } = mapCatalogRows([model()], [row], []);
      expect(items.length === 1).toBe(check(model(), row).visible);
    }
  });

  it("konfiguratsioon peidetud/arhiveeritud", () => {
    expect(check(model(), listing({ status: "ARCHIVED" })).blockedBy).toBe("listingStatus");
    expect(explain(model(), listing({ status: "ARCHIVED" })).reason?.short).toBe("Arhiveeritud");
  });

  it("mudel peidetud", () => {
    expect(check(model({ status: "HIDDEN" }), listing()).blockedBy).toBe("modelStatus");
    expect(explain(model({ status: "HIDDEN" }), listing()).reason?.short).toBe("Mudel peidetud");
  });

  it("Foxway Grade C (BLOCKED) — põhjus tarnija andmetest", () => {
    const row = listing({ grade: "C", qualityHold: "BLOCKED", qualityHoldReason: 'Seisukord "Grade C" — Foxway C klassi ei müüda' });
    expect(check(model(), row).blockedBy).toBe("qualityHold");
    const reason = explain(model(), row).reason!;
    expect(reason.short).toBe("Blokeeritud");
    expect(reason.detail).toContain("Foxway C klassi ei müüda");
  });

  it("REVIEW ja admini kinnipidamine; admini avaldamine (parandus null) teeb nähtavaks", () => {
    expect(explain(model(), listing({ qualityHold: "REVIEW", qualityHoldReason: "Tundmatu rike" })).reason?.short).toBe("Ülevaatusel");
    expect(explain(model(), listing({ manualOverrides: { qualityHold: "REVIEW" } })).reason?.detail).toContain("admini parandus");
    expect(check(model(), listing({ qualityHold: "REVIEW", manualOverrides: { qualityHold: null } })).visible).toBe(true);
  });

  it("saadavus: laoseis 0, tarnija nimekirjast kadunud, teadmata", () => {
    expect(explain(model(), listing({ stock: 0 })).reason?.short).toBe("Laoseis 0");
    expect(explain(model(), listing({ available: false })).reason?.short).toBe("Tarnijal pole");
    expect(explain(model(), listing({ stock: null, available: null })).reason?.short).toBe("Laoseis teadmata");
  });

  it("Laptopid.ee: kogus teadmata + saadaval → nähtav, 'Poes kohapeal', kogust ei leiutata", () => {
    const row = listing({ supplier: "laptopid", stock: null, available: true, deliveryMinDays: null, deliveryMaxDays: null });
    const result = explain(model(), row);
    expect(result.visible).toBe(true);
    expect(result.deliveryLabel).toBe("Poes kohapeal");
    expect(result.quantityUnknown).toBe(true);
  });

  it("kohustuslikud andmed puudu (sh lubamatu seisukord)", () => {
    const v = check(model(), listing({ ramGb: null, grade: "X" }));
    expect(v.blockedBy).toBe("requiredFields");
    expect(v.missing).toEqual(["ram", "grade"]);
    expect(explain(model(), listing({ ramGb: null, grade: "X" })).reason?.detail).toContain("RAM, lubatud seisukord");
  });

  it("esimene mittetäidetud tingimus on põhjus (järjekord)", () => {
    expect(check(model({ status: "HIDDEN" }), listing({ status: "HIDDEN", stock: 0 })).blockedBy).toBe("listingStatus");
  });
});

describe("Vaata poes ↗", () => {
  it("ainult nähtaval pakkumisel", () => {
    expect(storefrontHref({ visible: true, modelSlug: "lenovo-t14", publicListingId: "foxway-fx-1" })).toBe("/toode/lenovo-t14?konfiguratsioon=foxway-fx-1");
    expect(storefrontHref({ visible: false, modelSlug: "lenovo-t14", publicListingId: "foxway-fx-1" })).toBeNull();
  });

  it("explainVisibility: nähtav → null", () => {
    expect(explainVisibility({ blockedBy: null, listingStatus: "ACTIVE", modelStatus: "ACTIVE", qualityHold: null, available: true, stock: 1, missing: [] })).toBeNull();
  });
});

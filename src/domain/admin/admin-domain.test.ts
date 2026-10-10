import { describe, expect, it } from "vitest";
import { diffChanges } from "@/server/admin/audit";
import { redactConnectionStrings } from "@/server/db/database-url";
import { pricingConfig } from "@/config/pricing";
import { SETTINGS_SCHEMAS } from "@/domain/settings/settings";
import { listingIssuesOf } from "./data-quality-rules";
import { changedRows, previewPrices, validateBands } from "./pricing-admin";
import { euroCents, listingEditSchema } from "./product-edit";
import { settingsFromForm } from "./settings-form";

describe("hinnastamise admin", () => {
  it("vahemike valideerimine", () => {
    const band = (from: number, to: number | null) => ({ fromCostCents: from, toCostCents: to, markupFixedCents: 0, markupPercentBps: 0 });
    expect(validateBands([band(0, 30000), band(30000, null)])).toBeNull();
    expect(validateBands([])).toMatch(/vähemalt/);
    expect(validateBands([band(100, null)])).toMatch(/0 €/);
    expect(validateBands([band(0, 30000), band(40000, null)])).toMatch(/auk/);
    expect(validateBands([band(0, null), band(30000, null)])).toMatch(/viimane/);
    expect(validateBands([band(0, 0)])).toMatch(/suurem/);
  });

  it("eelvaade: arvutatud hind, erinevus, marginaal; puuduv ostuhind ja KM režiim ei peata teisi", () => {
    const rows = previewPrices(pricingConfig, [
      { id: "1", sku: "A", costCents: 30000, vatScheme: "MARGIN", currentCents: 1 },
      { id: "2", sku: "B", costCents: null, vatScheme: "MARGIN", currentCents: 50000 },
      { id: "3", sku: "C", costCents: 30000, vatScheme: "UNKNOWN", currentCents: 50000 },
    ]);
    expect(rows[0].calculatedCents).toBeGreaterThan(30000);
    expect(rows[0].differenceCents).toBe(rows[0].calculatedCents! - 1);
    expect(rows[0].marginPct).toBeGreaterThan(0);
    expect(rows[1].error).toBe("Ostuhind puudub");
    expect(rows[2].error).toBeTruthy();
    expect(changedRows(rows).map((r) => r.sku)).toEqual(["A"]);
  });
});

describe("vormid", () => {
  it("eurod → sendid", () => {
    expect(euroCents.parse("429")).toBe(42900);
    expect(euroCents.parse("429,50 €")).toBe(42950);
    expect(euroCents.parse("")).toBeNull();
    expect(euroCents.safeParse("-1").success).toBe(false);
  });

  it("tühi väli = puudub (null), mitte väljamõeldud vaikeväärtus", () => {
    // Brauser saadab kõik vormi väljad; tühjad väljad on ""
    const empty = Object.fromEntries(Object.keys(listingEditSchema.shape).map((key) => [key, ""]));
    const parsed = listingEditSchema.parse({ ...empty, status: "ACTIVE", touchscreen: "true" });
    expect(parsed.warrantyMonths).toBeNull();
    expect(parsed.batteryHealthPct).toBeNull();
    expect(parsed.chargerIncluded).toBeNull();
    expect(parsed.touchscreen).toBe(true);
    expect(parsed.cpu).toBeNull();
    expect(parsed.salePriceCents).toBeNull();
    // Puuduv väli (nt võltsitud päring) ei lähe läbi
    expect(listingEditSchema.safeParse({ status: "ACTIVE" }).success).toBe(false);
  });

  it("seadete vorm: tühi tekst → null; checkbox; tasuta tarne eurodes", () => {
    const fd = new FormData();
    fd.set("infoText", "  ");
    fd.set("freeShippingThreshold", "150");
    expect(SETTINGS_SCHEMAS.delivery.parse(settingsFromForm("delivery", fd))).toEqual({ infoText: null, freeShippingThresholdCents: 15000, standardShippingName: "Standardtarne", standardShippingCents: 699 });
    fd.set("standardShippingName", "Kuller");
    fd.set("standardShippingPrice", "4,99");
    expect(SETTINGS_SCHEMAS.delivery.parse(settingsFromForm("delivery", fd))).toMatchObject({ standardShippingName: "Kuller", standardShippingCents: 499 });
    fd.set("standardShippingPrice", "");
    expect(SETTINGS_SCHEMAS.delivery.safeParse(settingsFromForm("delivery", fd)).success).toBe(false);
    const store = new FormData();
    store.set("currency", "EUR");
    store.set("locale", "et-EE");
    expect(SETTINGS_SCHEMAS.store.parse(settingsFromForm("store", store))).toEqual({ prototypeMode: false, currency: "EUR", locale: "et-EE" });
    const bad = new FormData();
    bad.set("freeShippingThreshold", "palju");
    expect(SETTINGS_SCHEMAS.delivery.safeParse(settingsFromForm("delivery", bad)).success).toBe(false);
  });
});

describe("audit ja andmekvaliteet", () => {
  it("diff sisaldab ainult muutunud välju", () => {
    expect(diffChanges({ a: 1, b: "x", c: null }, { a: 1, b: "y", c: undefined })).toEqual({ b: { from: "x", to: "y" } });
    expect(diffChanges({ items: [1, 2] }, { items: [1, 2] })).toEqual({});
  });

  it("probleemid efektiivsetest väärtustest", () => {
    const base = { cpu: "i5", cpuGeneration: "intel-11", ramGb: 8, storageGb: 256, grade: "A", keyboard: "EST", salePriceCents: 1000, stock: 1 };
    expect(listingIssuesOf(base)).toEqual([]);
    expect(listingIssuesOf({ ...base, cpu: null, keyboard: null, stock: null })).toEqual(["missing-cpu", "unknown-keyboard", "missing-stock"]);
  });

  it("ühendusstring ei jõua logisse", () => {
    expect(redactConnectionStrings("viga: postgresql://user:secret@host/db?sslmode=require")).toBe("viga: [DATABASE_URL]");
  });
});

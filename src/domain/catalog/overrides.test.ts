import { describe, expect, it } from "vitest";
import { LISTING_OVERRIDABLE_FIELDS, applyOverrides, hasOverride, mergeOverrides } from "./overrides";

describe("manual overrides", () => {
  const supplier = { ramGb: 8, cpu: "i5", stock: 2, status: "ACTIVE" };

  it("efektiivne väärtus = parandus ?? tarnija väärtus", () => {
    expect(applyOverrides(supplier, { ramGb: 16 }, LISTING_OVERRIDABLE_FIELDS)).toMatchObject({ ramGb: 16, cpu: "i5" });
    expect(applyOverrides(supplier, null, LISTING_OVERRIDABLE_FIELDS)).toEqual(supplier);
  });

  it("parandus võib olla ka null (admin kustutab vale tarnija väärtuse)", () => {
    expect(hasOverride({ cpu: null }, "cpu")).toBe(true);
    expect(applyOverrides(supplier, { cpu: null }, LISTING_OVERRIDABLE_FIELDS).cpu).toBeNull();
  });

  it("lubamata välju ei saa overrides'iga muuta", () => {
    expect(applyOverrides(supplier, { status: "HIDDEN" }, LISTING_OVERRIDABLE_FIELDS).status).toBe("ACTIVE");
    expect(mergeOverrides(supplier, {}, { status: "HIDDEN" }, LISTING_OVERRIDABLE_FIELDS)).toEqual({});
  });

  it("tarnija väärtusega võrdne muudatus eemaldab paranduse", () => {
    expect(mergeOverrides(supplier, { ramGb: 16 }, { ramGb: 8 }, LISTING_OVERRIDABLE_FIELDS)).toEqual({});
    expect(mergeOverrides(supplier, {}, { ramGb: 32, cpu: "i5" }, LISTING_OVERRIDABLE_FIELDS)).toEqual({ ramGb: 32 });
  });
});

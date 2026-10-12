import { describe, expect, it } from "vitest";
import { pricingConfig } from "@/config/pricing";
import { MockSupplierAdapter } from "@/integrations/supplier/mock/mock-supplier-adapter";
import { buildCatalog } from "@/server/catalog/build-catalog";
import { compareCpuFamilies, cpuFamilyLabel, cpuFilterFamily, isCpuFamilyValue } from "./cpu-filter";
import { FACETS } from "./facets";
import { formatKeyboard } from "./format";
import { buildSpecSections } from "./spec-sections";
import type { CatalogItem } from "./types";

/** Foxway pakkumise kuvamine poes (puhtad funktsioonid): CPU filter, tehnilised andmed, klaviatuur. */

async function baseItem(): Promise<CatalogItem> {
  const source = await new MockSupplierAdapter().getProducts();
  return buildCatalog(source, { pricing: pricingConfig, featuredExternalIds: [], lastSyncedAt: null }).items[0];
}

const rows = (item: CatalogItem) => Object.fromEntries(buildSpecSections(item).flatMap((s) => s.rows.map((r) => [r.label, r.value])));

describe("Foxway poes", () => {
  it("Qualcomm Snapdragon X → oma CPU perekond (filter), mitte Intel/AMD", () => {
    expect(cpuFilterFamily({ model: "Qualcomm Snapdragon X Plus X1P-42-100", family: null, generationKey: null })).toBe("qualcomm-snapdragon-x");
    expect(isCpuFamilyValue("qualcomm-snapdragon-x")).toBe(true);
    expect(cpuFamilyLabel("qualcomm-snapdragon-x")).toBe("Qualcomm Snapdragon X");
    expect(compareCpuFamilies("apple-m2", "qualcomm-snapdragon-x")).toBeLessThan(0);
  });

  it("Maci 'Retina' ilma täpse resolutsioonita → kuvatakse 'Retina' (ei leiutata); aku garantii ja laadija rida", async () => {
    const base = await baseItem();
    const mac: CatalogItem = {
      ...base,
      variant: {
        ...base.variant,
        display: { resolution: null, resolutionLabel: "Retina", panel: null, touch: null },
        chargerIncluded: true,
        details: { source: "FOXWAY", batteryWarrantyMonths: 6, chargerLabel: "Originaalkarp ja laadija kaasas", originalBox: true, secondaryStorage: "1TB HDD", conditionNotices: [{ severity: "INFO", text: "Võib esineda väikeseid kosmeetilisi kasutusjälgi.", short: "x" }] },
      },
    };
    const specs = rows(mac);
    expect(specs.Resolutsioon).toBe("Retina");
    expect(specs["Aku garantii"]).toBe("6 kuud");
    expect(specs["Laadija komplektis"]).toBe("Jah, koos originaalkarbiga");
    expect(specs.Lisaketas).toBe("1TB HDD");
    expect(specs["Märkus seisukorra kohta"]).toBe("Võib esineda väikeseid kosmeetilisi kasutusjälgi.");
  });

  it("klaviatuur: täpne silt kaardil/ostukorvis ja filtri valik", async () => {
    const base = await baseItem();
    expect(formatKeyboard("SCA")).toBe("Skandinaavia (SCA) klaviatuur");
    const item = { ...base, variant: { ...base.variant, keyboardLayout: "FRA" } };
    expect(FACETS.kb.valuesOf(item)).toEqual(["fra"]);
    expect(FACETS.kb.optionLabel("fra")).toBe("Prantsuse (FRA)");
    expect(FACETS.kb.isValidValue("fra")).toBe(true);
    expect(FACETS.kb.isValidValue("<script>")).toBe(false);
    expect(FACETS.grade.isValidValue("c-plus")).toBe(true);
    expect(FACETS.grade.optionLabel("c-plus")).toBe("C+ · Rahuldav+");
  });
});

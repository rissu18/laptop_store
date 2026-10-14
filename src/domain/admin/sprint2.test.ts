import { describe, expect, it } from "vitest";
import { effectivePerformance, parsePerformanceOverride } from "@/domain/catalog/benchmarks";
import { galleryItem, icecatProduct } from "@/integrations/icecat/icecat-fixtures";
import { icecatPreviewThumbnails } from "@/integrations/icecat/icecat-image-resolver";
import { imageState } from "./image-state";
import { findPerformanceAnomalies, type AnomalyInput } from "./performance-anomalies";
import { listingProvenance } from "./provenance";

const enriched = (value: unknown) => ({ value, source: "LAPTOPID", matchedBy: "cpu:i5-8350u (3 pakkumist)", confidence: 1, at: "2026-10-14T00:00:00Z" });

describe("piltide olek (ausalt: vaste ≠ pildid)", () => {
  it("eristab ülevaatust, tagasilükkamist, vastet piltidega ja ilma", () => {
    expect(imageState({ icecatStatus: "NEEDS_REVIEW", icecatImages: 0, otherImages: 0 })).toBe("REVIEW");
    expect(imageState({ icecatStatus: "REJECTED", icecatImages: 0, otherImages: 3 })).toBe("REJECTED");
    expect(imageState({ icecatStatus: "MATCHED", icecatImages: 6, otherImages: 0 })).toBe("MATCHED_LOCAL");
    expect(imageState({ icecatStatus: "MATCHED", icecatImages: 0, otherImages: 0 })).toBe("MATCHED_NO_IMAGES");
    expect(imageState({ icecatStatus: "NOT_FOUND", icecatImages: 0, otherImages: 2 })).toBe("OWN_IMAGES");
    expect(imageState({ icecatStatus: null, icecatImages: 0, otherImages: 0 })).toBe("NO_MATCH");
  });
});

describe("kandidaadi eelvaate pisipildid", () => {
  it("annab kuni 6 pisipildi URL-i (väikseim sobiv variant), duplikaadid välja", () => {
    const product = icecatProduct({ gallery: Array.from({ length: 8 }, (_, i) => galleryItem(String(200 + i), i + 1)) });
    const thumbs = icecatPreviewThumbnails(product, 6);
    expect(thumbs).toHaveLength(6);
    expect(new Set(thumbs).size).toBe(6);
    expect(thumbs.every((url) => url.startsWith("https://images.icecat.biz/"))).toBe(true);
    expect(icecatPreviewThumbnails(icecatProduct({ gallery: [] }))).toEqual([]);
  });
});

describe("jõudluse parandus: valideerimine", () => {
  it("CPU / GPU kiirusindeks: lõplik arv > 0 ja ≤ 1 000 000", () => {
    expect(parsePerformanceOverride("cpuBenchmark", "6 235")).toEqual({ ok: true, value: 6235 });
    expect(parsePerformanceOverride("gpuBenchmark", "2100,5")).toEqual({ ok: true, value: 2100.5 });
    for (const bad of ["0", "-5", "abc", "", "Infinity", "2000000"]) {
      expect(parsePerformanceOverride("cpuBenchmark", bad).ok).toBe(false);
      expect(parsePerformanceOverride("gpuBenchmark", bad).ok).toBe(false);
    }
  });

  it("maks. sagedus: täisarv 400–7000 MHz", () => {
    expect(parsePerformanceOverride("cpuMaxMhz", "4900")).toEqual({ ok: true, value: 4900 });
    for (const bad of ["399", "7001", "4,9", "48000", "NaN"]) expect(parsePerformanceOverride("cpuMaxMhz", bad).ok).toBe(false);
  });

  it("parandus võidab tarnijat ja rikastust; null = märgitud puuduvaks", () => {
    const base = { details: { cpuBenchmark3dmark06: 5000, cpuMaxMhz: 4800 }, enrichment: { gpuBenchmark: enriched(1500) } as never };
    expect(effectivePerformance(base)).toEqual({ cpuMaxGhz: 4.8, cpuBenchmark: 5000, gpuBenchmark: 1500 });
    expect(effectivePerformance({ ...base, manualOverrides: { cpuMaxMhz: 4900, cpuBenchmark: 5100, gpuBenchmark: null } })).toEqual({ cpuMaxGhz: 4.9, cpuBenchmark: 5100, gpuBenchmark: null });
    // CPU nime parandus tühistab tarnija väärtuse, aga otsene jõudluse parandus kehtib
    expect(effectivePerformance({ ...base, manualOverrides: { cpu: "Intel Core i7-1255U", cpuBenchmark: 6100 } }).cpuBenchmark).toBe(6100);
    expect(effectivePerformance({ ...base, manualOverrides: { cpu: "Intel Core i7-1255U" } }).cpuMaxGhz).toBeNull();
  });
});

describe("väljade päritolu: parandus > tarnija > rikastus", () => {
  const listing = {
    priceSource: "SUPPLIER",
    cpu: "Intel Core i5-8350U",
    gpu: null,
    gpuDedicated: false,
    resolution: "1920x1080",
    resolutionLabel: null,
    ramGb: 16,
    storageGb: 256,
    screenSizeIn: 14,
    keyboard: null,
    details: { cpuBenchmark3dmark06: 5000, cpuMaxMhz: 3600 },
    enrichment: { gpu: enriched("Intel UHD Graphics 620"), cpuBenchmark: enriched(4800) },
    manualOverrides: { keyboard: "SCA", cpuMaxMhz: 3800 },
  };
  const rows = Object.fromEntries(listingProvenance(listing, { screenSizeIn: null }).map((row) => [row.field, row]));

  it("parandus on kõige kõrgem", () => {
    expect(rows.keyboard).toMatchObject({ supplier: null, hasManual: true, manual: "SCA", effective: "SCA", source: "manual" });
    expect(rows.cpuMaxMhz).toMatchObject({ supplier: 3600, hasManual: true, effective: 3800, source: "manual" });
  });

  it("tarnija enne rikastust; rikastus täidab ainult tühja välja", () => {
    expect(rows.cpuBenchmark).toMatchObject({ supplier: 5000, effective: 5000, source: "supplier" });
    expect(rows.cpuBenchmark.enrichment).toMatchObject({ value: 4800 });
    expect(rows.gpu).toMatchObject({ supplier: null, effective: "Intel UHD Graphics 620", source: "enrichment" });
    expect(rows.ramGb).toMatchObject({ supplier: 16, effective: 16, source: "supplier" });
  });

  it("ekraan: pood kasutab mudeli väärtust, kui see on olemas", () => {
    const withModel = listingProvenance(listing, { screenSizeIn: 14.1 }).find((row) => row.field === "screenSizeIn")!;
    expect(withModel).toMatchObject({ effective: 14.1, source: "model" });
  });
});

describe("kahtlased jõudlusandmed", () => {
  const row = (over: Partial<AnomalyInput> & { id: string }): AnomalyInput => ({ sku: over.id, cpu: "Intel Core i5-8350U", gpu: "Intel UHD Graphics 620", gpuDedicated: false, details: {}, enrichment: null, manualOverrides: {}, ...over });

  it("sama CPU eri väärtused → konflikt; ühtne väärtus → mitte", () => {
    const found = findPerformanceAnomalies([
      row({ id: "a", details: { cpuBenchmark3dmark06: 5000, cpuMaxMhz: 3600 } }),
      row({ id: "b", details: { cpuBenchmark3dmark06: 5000, cpuMaxMhz: 3600 } }),
      row({ id: "c", details: { cpuBenchmark3dmark06: 5400, cpuMaxMhz: 3600 } }),
    ]);
    const conflict = found.find((a) => a.kind === "CPU_BENCHMARK_CONFLICT")!;
    expect(conflict.key).toBe("i5-8350u");
    expect(conflict.values.map((v) => [v.value, v.listings.length])).toEqual([["5000", 2], ["5400", 1]]);
    expect(found.some((a) => a.kind === "CPU_MHZ_CONFLICT")).toBe(false);
  });

  it("sama CPU, erinev integreeritud GPU (i5-8350U: HD 520 vs UHD 620)", () => {
    const found = findPerformanceAnomalies([row({ id: "a" }), row({ id: "b", gpu: "Intel HD Graphics 520" })]);
    expect(found.find((a) => a.kind === "INTEGRATED_GPU_CONFLICT")?.values.map((v) => v.value).sort()).toEqual(["intel hd 520", "intel uhd 620"]);
  });

  it("kirjapildi erinevus (Iris Xe Graphics vs Iris Xe) ei ole konflikt", () => {
    const found = findPerformanceAnomalies([row({ id: "a", cpu: "Intel Core i5-1135G7", gpu: "Intel Iris Xe Graphics" }), row({ id: "b", cpu: "Intel Core i5-1135G7", gpu: "Intel Iris Xe" })]);
    expect(found).toEqual([]);
  });

  it("vahemikust väljas MHz ja benchmark ≤ 0", () => {
    const found = findPerformanceAnomalies([row({ id: "a", details: { cpuMaxMhz: 48000 } }), row({ id: "b", details: { gpuBenchmark3dmark11: 0 } })]);
    expect(found.map((a) => [a.kind, a.key])).toEqual([
      ["BENCHMARK_INVALID", "b"],
      ["MHZ_INVALID", "a"],
    ]);
  });
});

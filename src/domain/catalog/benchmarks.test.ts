import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { pricingConfig } from "@/config/pricing";
import { laptopidImages, laptopidProduct } from "@/integrations/laptopid/laptopid-fixtures";
import { normalizeLaptopidProduct } from "@/integrations/laptopid/laptopid-normalizer";
import { laptopidProductSchema } from "@/integrations/laptopid/laptopid-schema";
import { MockSupplierAdapter } from "@/integrations/supplier/mock/mock-supplier-adapter";
import { buildCatalog } from "@/server/catalog/build-catalog";
import { SpecSections } from "@/components/product/spec-sections";
import {
  BENCHMARK_INFO,
  buildBenchmarkIndex,
  cpuBenchmarkKey,
  effectivePerformance,
  formatBenchmark,
  formatGhz,
  gpuBenchmarkKey,
  parseBenchmark,
  validCpuMaxMhz,
} from "./benchmarks";
import { buildSpecSections } from "./spec-sections";
import type { CatalogItem } from "./types";

const normalize = (overrides: Record<string, unknown>) =>
  normalizeLaptopidProduct(laptopidProductSchema.parse(laptopidProduct(overrides)), laptopidImages(6678, [30530]).map((i) => i as never)).listing;

describe("Laptopid.ee API → kohalik benchmark (sync)", () => {
  it("cpu_3dmark06 / gpu_3dmark11 numbrina → details", () => {
    const listing = normalize({ cpu: "Intel i5-8350U 3600Mhz", cpu_3dmark06: 6235, gpu: "Intel UHD 620", gpu_3dmark11: 1700 });
    expect(listing.details).toMatchObject({ cpuBenchmark3dmark06: 6235, gpuBenchmark3dmark11: 1700, cpuMaxMhz: 3600 });
  });

  it("numbriline tekst → number; null / 0 / vigane → null (ei kuvata nullina)", () => {
    expect(normalize({ cpu_3dmark06: "6235", gpu_3dmark11: "1 294" }).details).toMatchObject({ cpuBenchmark3dmark06: 6235, gpuBenchmark3dmark11: 1294 });
    for (const bad of [null, 0, "0", "", "abc", -5, Number.NaN, Number.POSITIVE_INFINITY, "12a"]) {
      expect(parseBenchmark(bad), String(bad)).toBeNull();
    }
    expect(normalize({ cpu_3dmark06: null, gpu_3dmark11: 0 }).details).toMatchObject({ cpuBenchmark3dmark06: null, gpuBenchmark3dmark11: null });
    // vanem API ilma väljadeta
    expect(normalize({}).details.cpuBenchmark3dmark06).toBeNull();
  });

  it("maks. sagedus = Laptopid.ee CPU tekstis olev maksimaalne turbo (MHz → GHz), ebamõistlik → null", () => {
    expect(normalize({ cpu: "Intel i5-1345U 4700MHz" }).details.cpuMaxMhz).toBe(4700);
    expect(normalize({ cpu: "AMD Ryzen 5 5650U 4.2GHz" }).details.cpuMaxMhz).toBe(4200);
    expect(normalize({ cpu: "Apple M2 CPU 8-core" }).details.cpuMaxMhz).toBeNull();
    expect(validCpuMaxMhz(0)).toBeNull();
    expect(validCpuMaxMhz(42000)).toBeNull();
    expect(formatGhz(4.7)).toBe("4,70 GHz");
    expect(formatGhz(5)).toBe("5,00 GHz");
    expect(formatBenchmark(6250).replace(/\s/g, " ")).toBe("6 250");
  });
});

describe("täpne CPU/GPU vaste (ülekanne teistele tarnijatele)", () => {
  it("sama CPU mudel → sama võti; perekond ilma numbrita ei piisa; PRO ≠ mitte-PRO", () => {
    expect(cpuBenchmarkKey("Intel Core i5-8350U")).toBe("i5-8350u");
    expect(cpuBenchmarkKey("Intel Core i5-8350U")).toBe(cpuBenchmarkKey("Intel(R) Core(TM) i5-8350U"));
    expect(cpuBenchmarkKey("Intel Core i5")).toBeNull();
    expect(cpuBenchmarkKey("AMD Ryzen 7")).toBeNull();
    expect(cpuBenchmarkKey("AMD Ryzen 7 7840U")).toBe("ryzen 7 7840u");
    expect(cpuBenchmarkKey("AMD Ryzen 5 PRO 5650U")).not.toBe(cpuBenchmarkKey("AMD Ryzen 5 5650U"));
  });

  it('üldine GPU ("Integrated", "Intel Graphics", "AMD Radeon Graphics") ei saa benchmarki; RTX A2000 ≠ "RTX A2000 Laptop GPU"', () => {
    for (const generic of ["Integrated", "Integreeritud graafika", "Intel Graphics", "Intel HD", "Intel UHD Graphics", "AMD Radeon Graphics", "AMD Radeon PRO Graphics", "Intel Arc Graphics", "Apple GPU 10 core"]) {
      expect(gpuBenchmarkKey(generic), generic).toBeNull();
    }
    expect(gpuBenchmarkKey("NVIDIA RTX A2000")).not.toBe(gpuBenchmarkKey("NVIDIA RTX A2000 Laptop GPU"));
    expect(gpuBenchmarkKey("NVIDIA Quadro T1000 + Intel")).toBe(gpuBenchmarkKey("NVIDIA Quadro T1000"));
    expect(gpuBenchmarkKey("NVIDIA RTX 5000 Ada 16GB")).toBe("rtx 5000 ada");
    expect(gpuBenchmarkKey("Quadro RTX 3000")).not.toBe(gpuBenchmarkKey("RTX 3000 Ada"));
    expect(gpuBenchmarkKey("Intel Iris Xe Graphics")).toBe("intel iris xe graphics");
  });

  it("konfliktsed väärtused samale võtmele → ei valita suvaliselt", () => {
    const { index, conflicts } = buildBenchmarkIndex([
      { key: "i5-8350u", value: 6235, label: "Intel Core i5-8350U" },
      { key: "i5-8350u", value: 6235, label: "Intel Core i5-8350U" },
      { key: "intel uhd 620", value: 1700, label: "Intel UHD 620" },
      { key: "intel uhd 620", value: 1800, label: "Intel UHD 620" },
    ]);
    expect(index.get("i5-8350u")).toMatchObject({ value: 6235, samples: 2 });
    expect(index.has("intel uhd 620")).toBe(false);
    expect(conflicts).toEqual([{ key: "intel uhd 620", values: [1700, 1800], labels: ["Intel UHD 620"] }]);
  });

  it("efektiivne: tarnija enda väärtus → täpse vastega rikastus; admini CPU/GPU parandus tühistab need", () => {
    const enrichment = {
      cpuBenchmark: { value: 6235, source: "LAPTOPID" as const, matchedBy: "cpu:i5-8350u", confidence: 1, at: "x" },
      gpuBenchmark: { value: 1700, source: "LAPTOPID" as const, matchedBy: "gpu:intel uhd 620", confidence: 1, at: "x" },
      cpuMaxMhz: { value: 3600, source: "LAPTOPID" as const, matchedBy: "cpu:i5-8350u", confidence: 1, at: "x" },
    };
    expect(effectivePerformance({ details: {}, enrichment })).toEqual({ cpuMaxGhz: 3.6, cpuBenchmark: 6235, gpuBenchmark: 1700 });
    expect(effectivePerformance({ details: { cpuBenchmark3dmark06: 7000, cpuMaxMhz: 4000 }, enrichment })).toMatchObject({ cpuBenchmark: 7000, cpuMaxGhz: 4 });
    expect(effectivePerformance({ details: { cpuBenchmark3dmark06: 7000 }, enrichment, manualOverrides: { cpu: "Intel Core i7-8650U" } })).toEqual({ cpuMaxGhz: null, cpuBenchmark: null, gpuBenchmark: 1700 });
    expect(effectivePerformance({ details: {}, enrichment, manualOverrides: { gpu: "NVIDIA MX150" } }).gpuBenchmark).toBeNull();
  });
});

// ---- Tehnilised andmed (UI) -------------------------------------------------------------------------------------

async function baseItem(): Promise<CatalogItem> {
  const source = await new MockSupplierAdapter().getProducts();
  return buildCatalog(source, { pricing: pricingConfig, featuredExternalIds: [], lastSyncedAt: null }).items[0];
}
const withCpuGpu = (item: CatalogItem, cpu: Partial<CatalogItem["variant"]["cpu"]>, gpu: Partial<CatalogItem["variant"]["gpu"]> = {}): CatalogItem => ({
  ...item,
  variant: { ...item.variant, cpu: { ...item.variant.cpu, ...cpu }, gpu: { ...item.variant.gpu, ...gpu } },
});

describe("tehnilised andmed: jõudlus, kiirusindeks, maks. sagedus", () => {
  it("Jõudlus algab protsessori täisnimest; mälu ja salvestus on päris read; olulised read esile tõstetud", async () => {
    const item = withCpuGpu(await baseItem(), { model: "Intel Core i5-1345U", maxGhz: 4.7, benchmark: 12480 }, { model: "Intel Iris Xe Graphics", benchmark: 5400 });
    const perf = buildSpecSections(item).find((s) => s.title === "Jõudlus")!;
    expect(perf.rows.map((r) => r.label)).toEqual(
      ["Protsessor", "Maks. sagedus", "Kiirusindeks", "Protsessori põlvkond", "Mälu", "Mälu tüüp", "Salvestus", "Lisaketas", "Graafika", "Kiirusindeks"].filter((label) =>
        perf.rows.some((r) => r.label === label),
      ),
    );
    expect(perf.rows[0]).toMatchObject({ label: "Protsessor", value: "Intel Core i5-1345U", emphasis: true });
    expect(perf.rows.find((r) => r.label === "Maks. sagedus")?.value).toBe("4,70 GHz");
    expect(perf.rows.find((r) => r.info === "cpu-benchmark")?.value.replace(/\s/g, " ")).toBe("12 480");
    expect(perf.rows.find((r) => r.info === "gpu-benchmark")?.value.replace(/\s/g, " ")).toBe("5 400");
    expect(perf.rows.find((r) => r.label === "Mälu")).toMatchObject({ value: `${item.variant.ramGb} GB`, emphasis: true });
    expect(perf.rows.find((r) => r.label === "Salvestus")?.value).toMatch(/SSD$/);
    // väärtusi hinnanguna ("kiire", "nõrk") ei kirjutata
    expect(JSON.stringify(perf)).not.toMatch(/kiire|nõrk|professionaal/i);
  });

  it("benchmark / sagedus puudub või 0 → rida puudub (mitte '–' ega '0')", async () => {
    const item = withCpuGpu(await baseItem(), { maxGhz: null, benchmark: 0 }, { benchmark: null });
    const labels = buildSpecSections(item).flatMap((s) => s.rows.map((r) => r.label));
    expect(labels).not.toContain("Kiirusindeks");
    expect(labels).not.toContain("Maks. sagedus");
    expect(labels).toContain("Protsessor");
  });

  it("tooltip: CPU = 3DMark06 CPU, GPU = 3DMark11 GPU; nupp on klaviatuuriga kasutatav ja selgitus seotud (aria-describedby)", async () => {
    const item = withCpuGpu(await baseItem(), { benchmark: 6235, maxGhz: 3.6 }, { model: "Intel UHD 620", benchmark: 1700 });
    const html = renderToStaticMarkup(createElement(SpecSections, { item }));
    expect(html).toContain("Benchmark: 3DMark06 CPU");
    expect(html).toContain("Benchmark: 3DMark11 GPU");
    expect(html).toContain(BENCHMARK_INFO.note);
    expect(html).toMatch(/<button type="button" aria-label="Protsessori kiirusindeksi selgitus" aria-describedby="[^"]+" aria-expanded="false"/);
    expect(html).toMatch(/role="tooltip"/);
    // mobiil: puudutus avab (onClick), pikk nimi murdub
    const tip = readFileSync("src/components/ui/info-tip.tsx", "utf8");
    expect(tip).toContain("onClick={() => setOpen((value) => !value)}");
    expect(tip).toContain('event.key === "Escape"');
    expect(html).toContain("[overflow-wrap:anywhere]");
  });

  it("tootelehel pole enam väikest dubleerivat kokkuvõtet tehniliste andmete pealkirja all", () => {
    expect(readFileSync("src/app/(shop)/toode/[slug]/page.tsx", "utf8")).not.toContain("formatSpecLine(item)");
  });
});

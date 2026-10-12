import { describe, expect, it } from "vitest";
import { pricingConfig } from "@/config/pricing";
import { keyboardReportedMissing, listingIssuesOf } from "@/domain/admin/data-quality-rules";
import { MockSupplierAdapter } from "@/integrations/supplier/mock/mock-supplier-adapter";
import { parseCpu, parseKeyboardLayout } from "@/integrations/supplier/spec-parsers";
import { buildCatalog } from "@/server/catalog/build-catalog";
import { compareCpuGenerations, cpuGenerationLabel, isCpuFamilyValue, isCpuGenerationValue, parseCpuInfo } from "./cpu-filter";
import { applyListingEnrichment, buildIntegratedGpuIndex, cpuGpuKey, displayGpu, GENERIC_INTEGRATED_GPU } from "./enrichment";
import { keyboardFilterValue, keyboardLabel, normalizeKeyboard } from "./keyboard";
import { appleKey, findModelMatch, modelTokens, type MatchableModel } from "./model-match";
import { buildQuickSpecs } from "./quick-specs";
import type { CatalogItem } from "./types";

// ---- CPU põlvkond ---------------------------------------------------------------------------------------------

describe("CPU parser (keskne: sync + poe filter)", () => {
  it.each([
    ["Intel Core i5-8350U", "intel-core-i5", "intel-8"],
    ["Intel Core i7-8650U", "intel-core-i7", "intel-8"],
    ["Intel Core i5-10210U", "intel-core-i5", "intel-10"],
    ["Intel Core i7-1165G7", "intel-core-i7", "intel-11"],
    ["Intel Core i5-1235U", "intel-core-i5", "intel-12"],
    ["Intel Core i7-1365U", "intel-core-i7", "intel-13"],
    ["Intel Core i7-14700HX", "intel-core-i7", "intel-14"],
    ["Intel Core i5-3320M", "intel-core-i5", "intel-3"],
    ["i7-6820HQ", "intel-core-i7", "intel-6"],
  ])("Intel Core i: %s → %s / %s", (cpu, family, gen) => {
    expect(parseCpuInfo(cpu)).toEqual({ family, generationKey: gen });
  });

  it.each([
    ["Intel Core Ultra 5 125U", "intel-core-ultra-5", "ultra-1"],
    ["Intel Core Ultra 7 155H", "intel-core-ultra-7", "ultra-1"],
    ["Intel Core Ultra 7 165U", "intel-core-ultra-7", "ultra-1"],
    ["Intel Core Ultra 7 258V", "intel-core-ultra-7", "ultra-2"],
    ["Intel Core Ultra 9 285H", "intel-core-ultra-9", "ultra-2"],
    // Tech kirjutab ilma "Core"-ta
    ["Ultra 7 165H", "intel-core-ultra-7", "ultra-1"],
  ])("Core Ultra: %s", (cpu, family, gen) => {
    expect(parseCpuInfo(cpu)).toEqual({ family, generationKey: gen });
  });

  it("Intel Core seeria 1 (ilma i-ta) ja Core m — ei segata Core i ega Ultraga", () => {
    expect(parseCpuInfo("Intel Core 7 150U")).toEqual({ family: "intel-core-7", generationKey: "core-1" });
    expect(parseCpuInfo("Intel Core 3 100U")).toEqual({ family: "intel-core-3", generationKey: "core-1" });
    expect(parseCpuInfo("m7-6Y75").generationKey).toBe("intel-6");
    expect(parseCpuInfo("Intel Core M3-7Y32").generationKey).toBe("intel-7");
    expect(cpuGenerationLabel("core-1")).toBe("Intel Core (seeria 1)");
  });

  it.each([
    ["AMD Ryzen 5 3500U", "amd-ryzen-5", "amd-3000"],
    ["AMD Ryzen 7 PRO 4750U", "amd-ryzen-7", "amd-4000"],
    ["AMD Ryzen 5 PRO 5650U", "amd-ryzen-5", "amd-5000"],
    ["AMD Ryzen 7 PRO 6850U", "amd-ryzen-7", "amd-6000"],
    // turunduse seeria (7530U on Zen 3, aga poe filter on seeriapõhine)
    ["AMD Ryzen 5 7530U", "amd-ryzen-5", "amd-7000"],
    ["AMD Ryzen 7 8840U", "amd-ryzen-7", "amd-8000"],
    ["AMD Ryzen AI 9 365", "amd-ryzen-ai-9", "amdai-300"],
    ["AMD AI 7 PRO 360", "amd-ryzen-ai-7", "amdai-300"],
  ])("Ryzen: %s", (cpu, family, gen) => {
    expect(parseCpuInfo(cpu)).toEqual({ family, generationKey: gen });
  });

  it("Apple Silicon: kiibi põlvkond eraldi, Pro/Max perekonnas — M2 Pro EI ole '2. põlvkond'", () => {
    expect(parseCpuInfo("Apple M1")).toEqual({ family: "apple-m1", generationKey: "apple-1" });
    expect(parseCpuInfo("Apple M2 Pro 12-Core")).toEqual({ family: "apple-m2-pro", generationKey: "apple-2" });
    expect(parseCpuInfo("Apple M2 Max 38-Core GPU")).toEqual({ family: "apple-m2-max", generationKey: "apple-2" });
    expect(parseCpuInfo("Apple M5 Max 18C/32G")).toEqual({ family: "apple-m5-max", generationKey: "apple-5" });
    expect(cpuGenerationLabel("apple-2")).toBe("Apple M2");
    expect(isCpuFamilyValue("apple-m2-pro")).toBe(true);
  });

  it("Snapdragon X: perekond + 1. põlvkond koodist", () => {
    expect(parseCpuInfo("Qualcomm Snapdragon X Elite X1E-80-100")).toEqual({ family: "qualcomm-snapdragon-x", generationKey: "snapdragon-1" });
    expect(parseCpuInfo("Qualcomm Snapdragon X X1-26-100").generationKey).toBe("snapdragon-1");
    expect(isCpuGenerationValue("snapdragon-1")).toBe(true);
  });

  it("ebakindel → NULL (ei arvata)", () => {
    for (const cpu of ["N100", "Intel Celeron N3160", "AMD PRO A10-8700B R6", "A4-5150M", "AMD Ryzen 7", "Intel Core 3 N355"]) {
      expect(parseCpuInfo(cpu).generationKey, cpu).toBeNull();
    }
  });

  it("tarnija sync kasutab sama parserit; filtri järjekord hoiab uued rühmad eraldi", () => {
    expect(parseCpu("Apple M2 10-core GPU")).toEqual(parseCpuInfo("Apple M2 10-core GPU"));
    expect(["intel-12", "core-1", "ultra-2", "snapdragon-1"].sort(compareCpuGenerations)).toEqual(["ultra-2", "core-1", "intel-12", "snapdragon-1"]);
  });
});

// ---- Klaviatuur -------------------------------------------------------------------------------------------------

describe("klaviatuuri register", () => {
  it.each([
    ["SCA", "SCA", "Skandinaavia (SCA)"],
    ["SWE", "SWE", "Rootsi (SWE)"],
    ["SWE/FIN", "SWE", "Rootsi (SWE)"],
    ["FIN", "SWE", "Rootsi (SWE)"],
    ["NOR", "NOR", "Norra (NOR)"],
    ["DEU", "DE", "Saksa (DE)"],
    ["DE", "DE", "Saksa (DE)"],
    ["GER", "DE", "Saksa (DE)"],
    ["USA", "US", "USA"],
    ["US", "US", "USA"],
    ["FRA", "FRA", "Prantsuse (FRA)"],
    ["ITA", "ITA", "Itaalia (ITA)"],
    ["ESP", "ESP", "Hispaania (ESP)"],
    ["INT", "INT", "Rahvusvaheline (INT)"],
    ["PRT", "PRT", "Portugali (PRT)"],
    ["CZE", "CZE", "Tšehhi (CZE)"],
    ["HUN", "HUN", "Ungari (HUN)"],
    ["RUS", "RUS", "Vene (RUS)"],
    ["ARABIC", "ARA", "Araabia (ARA)"],
    ["ARA", "ARA", "Araabia (ARA)"],
    ["KOR", "KOR", "Korea (KOR)"],
    ["JPN", "JPN", "Jaapani (JPN)"],
    ["ISL", "ISL", "Islandi (ISL)"],
    ["HRV", "HRV", "Horvaatia (HRV)"],
    ["GRC", "GRC", "Kreeka (GRC)"],
    ["EST", "EST", "Eesti (EST)"],
    // Laptopid.ee — varem "tundmatu"
    ["ENG", "ENG", "Inglise (ENG)"],
    ["SWE/RUS", "SWE/RUS", "Rootsi + vene (SWE/RUS)"],
  ])("%s → %s (%s)", (raw, code, label) => {
    const result = normalizeKeyboard(raw);
    expect(result).toMatchObject({ code, known: true, missing: false, raw });
    expect(keyboardLabel(code)).toBe(label);
  });

  it("füüsiliselt erinevaid ei liideta: SCA ≠ SWE ≠ NOR; ENG ei ole US ega UK", () => {
    const codes = ["SCA", "SWE", "NOR", "ENG", "US", "UK", "SWE/RUS"].map((k) => normalizeKeyboard(k).code);
    expect(new Set(codes).size).toBe(7);
    expect(keyboardFilterValue("SWE/RUS")).toBe("swe-rus");
  });

  it("tundmatu kood säilib toorkujul (ei arvata), Laptopid.ee tühi väärtus jääb NULL-iks", () => {
    expect(normalizeKeyboard("XYZ")).toEqual({ code: "XYZ", known: false, missing: false, raw: "XYZ" });
    expect(parseKeyboardLayout("XYZ")).toBeNull();
    expect(parseKeyboardLayout("")).toBeNull();
    expect(parseKeyboardLayout("ENG")).toBe("ENG");
  });

  it('"Missing Keyboard" ei ole paigutus: eraldi kvaliteediprobleem, mitte "tundmatu klaviatuur"', () => {
    expect(normalizeKeyboard("Missing Keyboard")).toEqual({ code: null, known: false, missing: true, raw: "Missing Keyboard" });
    const base = { cpu: "x", cpuGeneration: "intel-8", ramGb: 8, storageGb: 256, grade: "A", keyboard: null, salePriceCents: 1, stock: 1 };
    expect(keyboardReportedMissing({ rawData: { foxway: { keyboard: "Missing Keyboard" } } })).toBe(true);
    expect(listingIssuesOf({ ...base, rawData: { foxway: { keyboard: "Missing Keyboard" } } })).toEqual(["missing-keyboard"]);
    expect(listingIssuesOf({ ...base, rawData: { foxway: { keyboard: null } } })).toEqual(["unknown-keyboard"]);
  });
});

// ---- Rikastus: GPU ja allikate prioriteet --------------------------------------------------------------------------

describe("rikastus: efektiivne väärtus ja allikate prioriteet", () => {
  const listing = { gpu: null as string | null, gpuDedicated: false as boolean | null, resolution: null as string | null, resolutionLabel: "Retina" as string | null };
  const enrichment = {
    gpu: { value: "Intel Iris Xe Graphics", source: "LAPTOPID" as const, matchedBy: "cpu:i5-1135g7", confidence: 0.9, at: "2026-10-12T00:00:00Z" },
    resolution: { value: { resolution: "2560x1600", label: "Retina" }, source: "LOCAL" as const, matchedBy: "model", confidence: 0.9, at: "2026-10-12T00:00:00Z" },
  };

  it('täpsem rikastatud GPU võidab tarnija üldise "Integrated" (NULL + dedicated=false)', () => {
    expect(applyListingEnrichment(listing, enrichment)).toMatchObject({ gpu: "Intel Iris Xe Graphics", gpuDedicated: false, resolution: "2560x1600" });
  });

  it("tarnija täpne väärtus ja admini parandus (efektiivne väli) võidavad rikastuse", () => {
    expect(applyListingEnrichment({ ...listing, gpu: "NVIDIA RTX A2000", gpuDedicated: true }, enrichment).gpu).toBe("NVIDIA RTX A2000");
    // admini parandus on enne rikastust juba efektiivses väljas (manual_overrides → effectiveListing)
    expect(applyListingEnrichment({ ...listing, gpu: "Intel UHD 620 (admin)" }, enrichment).gpu).toBe("Intel UHD 620 (admin)");
    expect(applyListingEnrichment({ ...listing, resolution: "1920x1200" }, enrichment).resolution).toBe("1920x1200");
  });

  it('kuvamine: "Integrated" ilma täpse nimeta → "Integreeritud graafika", teadmata → tühi (kasti ei kuvata)', () => {
    expect(displayGpu(null, false)).toBe(GENERIC_INTEGRATED_GPU);
    expect(displayGpu(null, null)).toBe("");
    expect(displayGpu(" Intel Iris Xe ", false)).toBe("Intel Iris Xe");
  });

  it("GPU indeks CPU järgi: Laptopid.ee enne meie muid andmeid, vastuolu → ei arvata", () => {
    const index = buildIntegratedGpuIndex([
      { cpu: "Intel Core i5-1135G7", gpu: "Intel Iris Xe Graphics", supplier: "laptopid" },
      { cpu: "Intel Core i5-1135G7", gpu: "Intel Iris Xe", supplier: "laptopid" },
      { cpu: "Intel Core i5-1135G7", gpu: "Intel UHD Graphics", supplier: "tech" },
      { cpu: "Intel Core i5-7200U", gpu: "Intel HD 620", supplier: "tech" },
      { cpu: "AMD Ryzen 5 5600U", gpu: "AMD Radeon Graphics", supplier: "laptopid" },
      { cpu: "AMD Ryzen 5 5600U", gpu: "AMD Radeon RX Vega 7", supplier: "laptopid" },
    ]);
    expect(index.get(cpuGpuKey("Intel Core i5-1135G7"))).toEqual({ value: "Intel Iris Xe Graphics", source: "LAPTOPID", samples: 2 });
    expect(index.get(cpuGpuKey("i5-7200U"))).toMatchObject({ value: "Intel HD 620", source: "LOCAL" });
    expect(index.has(cpuGpuKey("AMD Ryzen 5 5600U"))).toBe(false);
  });
});

// ---- Mudeli vaste (pildid) --------------------------------------------------------------------------------------

const m = (id: string, manufacturer: string, family: string, model: string, screenSizeIn: number | null, extra: Partial<MatchableModel> = {}): MatchableModel => ({
  id,
  slug: id,
  manufacturer,
  family,
  model,
  screenSizeIn,
  ...extra,
});

describe("mudeli vaste Laptopid.ee mudeliga (konservatiivne)", () => {
  const pool = [
    m("lp-rugged", "dell", "Latitude", "14 Rugged 5430", 14),
    m("lp-7310-carbon", "dell", "Latitude", "7310 Carbon", 13.3),
    m("lp-fury-17-g8", "hp", "ZBook", "Fury 17 G8", 17.3),
    m("lp-l15-g1", "lenovo", "ThinkPad", "L15 Gen 1", 15.6),
    m("lp-l15-g2", "lenovo", "ThinkPad", "L15 Gen 2", 15.6),
    m("lp-mbp13-2022", "apple", "MacBook Pro", "2022", 13.3, { cpus: ["Apple M2 CPU 8-core"] }),
    m("lp-mbp16-2023", "apple", "MacBook Pro", "M2 Pro 2023", 16.2, { cpus: ["Apple M2 Pro CPU 12-core"] }),
  ];

  it("kindel vaste: sama sõnade hulk + ekraan (Dell '5430 Rugged' = '14 Rugged 5430')", () => {
    const result = findModelMatch(m("tech-rugged", "dell", "Latitude", "5430 Rugged", 14), pool);
    expect(result).toMatchObject({ status: "MATCH", target: { id: "lp-rugged" } });
  });

  it("erinev ekraan → vastet pole (ZBook Fury 15 G8 ≠ Fury 17 G8)", () => {
    expect(findModelMatch(m("fx-fury-15", "hp", "ZBook", "Fury 15 G8", 15.6), pool).status).toBe("NONE");
  });

  it("ebakindel vaste → REVIEW, mitte automaatne (7310 vs 7310 Carbon; L15 ilma Gen-ita)", () => {
    expect(findModelMatch(m("tech-7310", "dell", "Latitude", "7310", 13), pool)).toMatchObject({ status: "REVIEW" });
    const l15 = findModelMatch(m("tech-l15", "lenovo", "ThinkPad", "L15", 15), pool);
    expect(l15.status).toBe("REVIEW");
    expect(l15.status === "REVIEW" && l15.candidates.map((c) => c.id).sort()).toEqual(["lp-l15-g1", "lp-l15-g2"]);
  });

  it("Lenovo 'Gen 6' ja '(6th Gen)' on sama; konfiguratsiooni sabad ei loe", () => {
    expect(modelTokens({ family: "ThinkPad", model: "X1 Carbon (6th Gen)", screenSizeIn: 14 })).toEqual(modelTokens({ family: "ThinkPad", model: "X1 Carbon Gen 6", screenSizeIn: 14 }));
  });

  it("Apple: tarnija toorne tootenimi + ekraan + aasta + kiip (Foxway 'M2 Pro 2023' ei kaota suurust)", () => {
    const fx13 = m("fx-mbp13", "apple", "MacBook Pro", '13" 2022 M2', 13, { rawNames: ['Apple MacBook Pro (13" 2022, M2)'] });
    expect(findModelMatch(fx13, pool)).toMatchObject({ status: "MATCH", target: { id: "lp-mbp13-2022" }, matchedBy: "apple:pro-13-2022-m2" });
    // 14" 2023 M2 ei ole 16" 2023 M2 Pro
    const fx14 = m("fx-mbp14", "apple", "MacBook Pro", '14" 2023 M2', 14, { rawNames: ['Apple MacBook Pro (14" 2023, M2)'] });
    expect(findModelMatch(fx14, pool).status).toBe("NONE");
    expect(appleKey(m("fx16", "apple", "MacBook Pro", "M2 Pro 2023", 16, { rawNames: ['Apple MacBook Pro (16" 2023, M2)'] }))).toEqual({ line: "pro", size: 16, year: 2023, chip: "m2" });
    // Air 2020 Intel ≠ Air 2020 M1
    const airIntel = m("air-i", "apple", "MacBook Air", '13" 2020', 13, { cpus: ["Intel Core i5-1030NG7"] });
    expect(findModelMatch(airIntel, [m("air-m1", "apple", "MacBook Air", '13" 2020 M1', 13, { cpus: ["Apple M1"] })]).status).toBe("NONE");
  });
});

// ---- Tootelehe kiirinfo kastid -----------------------------------------------------------------------------------

async function baseItem(): Promise<CatalogItem> {
  const source = await new MockSupplierAdapter().getProducts();
  return buildCatalog(source, { pricing: pricingConfig, featuredExternalIds: [], lastSyncedAt: null }).items[0];
}

const withVariant = (item: CatalogItem, variant: Partial<CatalogItem["variant"]>, product: Partial<CatalogItem["product"]> = {}): CatalogItem => ({
  product: { ...item.product, ...product },
  variant: { ...item.variant, ...variant },
});

describe("tootelehe kiirinfo kastid (GPU kast)", () => {
  it("järjekord: Protsessor, Mälu, Salvestus, Ekraan, Klaviatuur, Graafika", async () => {
    const item = withVariant(await baseItem(), { keyboardLayout: "SWE", gpu: { model: "Intel Iris Xe Graphics", dedicated: false } });
    expect(buildQuickSpecs(item).map((s) => s.key)).toEqual(["cpu", "ram", "storage", "display", "keyboard", "gpu"]);
  });

  it("GPU kast on olemas, kui tehnilistes andmetes on graafika (ka rikastatud / 'Integreeritud graafika')", async () => {
    const item = withVariant(await baseItem(), { keyboardLayout: "SCA", gpu: { model: displayGpu(null, false), dedicated: false } });
    expect(buildQuickSpecs(item).find((s) => s.key === "gpu")?.value).toBe("Integreeritud graafika");
  });

  it("puuduv GPU/klaviatuur → tühja lahtrit ei jää: järgmine olemasolev omadus või täislaiuses viimane kast", async () => {
    const base = await baseItem();
    const noGpu = withVariant(base, { keyboardLayout: "SWE", gpu: { model: "", dedicated: false }, os: "Windows 11 Pro", details: {} }, { weightKg: null });
    const specs = buildQuickSpecs({ ...noGpu, variant: { ...noGpu.variant, weightKg: null } });
    expect(specs.some((s) => s.key === "gpu")).toBe(false);
    expect(specs.length % 2).toBe(0);
    expect(specs.at(-1)?.key).toBe("os");

    const bare = withVariant(base, { keyboardLayout: null, gpu: { model: "", dedicated: false }, os: null, warrantyMonths: null, weightKg: null, details: {} }, { weightKg: null });
    const bareSpecs = buildQuickSpecs(bare);
    expect(bareSpecs.length).toBe(4);
    expect(bareSpecs.some((s) => !s.value)).toBe(false);
    const odd = buildQuickSpecs(withVariant(bare, { gpu: { model: "AMD Radeon", dedicated: false } }));
    expect(odd.length).toBe(5);
    expect(odd.at(-1)).toMatchObject({ key: "gpu", wide: true });
  });

  it("klaviatuuri kast kasutab ka tarnija toorkuju, kui kood pole registris (sama mis tehnilised andmed)", async () => {
    const item = withVariant(await baseItem(), { keyboardLayout: null, details: { keyboardRaw: "SWE/DEU" } });
    expect(buildQuickSpecs(item).find((s) => s.key === "keyboard")?.value).toBe("SWE/DEU");
  });
});

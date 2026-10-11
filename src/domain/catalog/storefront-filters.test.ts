import { describe, expect, it } from "vitest";
import { pricingConfig } from "@/config/pricing";
import { MockSupplierAdapter } from "@/integrations/supplier/mock/mock-supplier-adapter";
import { buildCatalog } from "@/server/catalog/build-catalog";
import { compareCpuFamilies, compareCpuGenerations, cpuFamilyLabel, cpuFilterFamily, cpuFilterGeneration } from "./cpu-filter";
import { differenceGroups, normalizeCompareValue, rowHasDifferences } from "./compare-diff";
import { displayModelName, displayProductTitle } from "./display-name";
import { FACETS, seriesFilterValue, seriesLabel } from "./facets";
import { computeFacets, filterItems, type SearchableItem } from "./filtering";
import { emptyQuery, parseCatalogQuery } from "./query";
import { buildSearchText, matchesSearch, tokenize } from "./search";
import type { BrandCode, CatalogItem } from "./types";

async function baseItem(): Promise<CatalogItem> {
  const source = await new MockSupplierAdapter().getProducts();
  return buildCatalog(source, { pricing: pricingConfig, featuredExternalIds: [], lastSyncedAt: null }).items[0];
}

/** Testkirje: mudel + CPU muudetud, otsingutekst arvutatakse uuesti (nagu kataloogi mapper) */
function item(base: CatalogItem, id: string, product: { brand: BrandCode; series: string; model: string }, cpu?: Partial<CatalogItem["variant"]["cpu"]>): SearchableItem {
  const result: CatalogItem = {
    product: { ...base.product, ...product, model: displayModelName(product.brand, product.model), title: displayProductTitle(product.brand, product.series, product.model) },
    variant: { ...base.variant, id, sku: id, cpu: { ...base.variant.cpu, ...cpu } },
  };
  return { ...result, searchText: buildSearchText(result) };
}

/** Päris kataloogi Lenovo mudelid (production, 2026-10-11): seeria + kanooniline mudelinimi */
const REAL_LENOVO_MODELS: [string, string][] = [
  ["ThinkBook", "14 G6 IRL"],
  ["ThinkPad", "E14 Gen 4"],
  ["ThinkPad", "E15 Gen 4"],
  ["ThinkPad", "L13 Gen 3"],
  ["ThinkPad", "L13 Yoga"],
  ["ThinkPad", "L14 Gen 4"],
  ["ThinkPad", "L15 Gen 3"],
  ["ThinkPad", "T14 Gen 4"],
  ["ThinkPad", "T14s Gen 2"],
  ["ThinkPad", "T16 Gen 1"],
  ["ThinkPad", "T480s"],
  ["ThinkPad", "T490s"],
  ["ThinkPad", "X1 2-in-1 Gen 9"],
  ["ThinkPad", "X1 Carbon Gen 10"],
  ["ThinkPad", "X1 Extreme Gen 4"],
  ["ThinkPad", "X1 Yoga Gen 5"],
  ["ThinkPad", "X13 Gen 3"],
  ["ThinkPad", "X13 Yoga Gen 2"],
  ["ThinkPad", "X395"],
  ["ThinkPad P", "P1 Gen 3"],
  ["ThinkPad P", "P14s Gen 2"],
  ["ThinkPad P", "P16v Gen 2"],
  ["V Series", "V330-14IKB"],
  ["Yoga", "7 16ILL10 2-in-1"],
];

describe("filtrid: Lenovo seeriad", () => {
  it("kõik päris kataloogi Lenovo seeriad jõuavad filtrisse (ThinkPad alamseeriad mudelinimest)", async () => {
    const base = await baseItem();
    const items = REAL_LENOVO_MODELS.map(([series, model], i) => item(base, `L${i}`, { brand: "lenovo", series, model }));
    const options = computeFacets(items, emptyQuery()).multi.series.map((o) => o.label);
    expect(options).toEqual([
      "Lenovo ThinkBook",
      "Lenovo ThinkPad E",
      "Lenovo ThinkPad L",
      "Lenovo ThinkPad P",
      "Lenovo ThinkPad T",
      "Lenovo ThinkPad X",
      "Lenovo ThinkPad X1",
      "Lenovo ThinkPad X13",
      "Lenovo V-seeria",
      "Lenovo Yoga",
    ]);
  });

  it("X1 ja X13 on eraldi; X395 on X-seeria; teiste tootjate seeriad ei muutu", () => {
    expect(seriesFilterValue({ brand: "lenovo", series: "ThinkPad", model: "X1 Carbon G10" })).toBe("thinkpad-x1");
    expect(seriesFilterValue({ brand: "lenovo", series: "ThinkPad", model: "X13 Yoga G2" })).toBe("thinkpad-x13");
    expect(seriesFilterValue({ brand: "lenovo", series: "ThinkPad", model: "X395" })).toBe("thinkpad-x");
    expect(seriesFilterValue({ brand: "dell", series: "Latitude", model: "7440" })).toBe("latitude");
  });

  it("eri kirjapildiga sama seeria → üks valik (duplikaate pole)", async () => {
    const base = await baseItem();
    const items = [
      item(base, "A", { brand: "lenovo", series: "ThinkPad", model: "T14 Gen 4" }),
      item(base, "B", { brand: "lenovo", series: "Thinkpad", model: "T14 G4" }),
      item(base, "C", { brand: "lenovo", series: "THINKPAD", model: "t480s" }),
    ];
    const options = computeFacets(items, emptyQuery()).multi.series;
    expect(options).toEqual([{ value: "thinkpad-t", label: "Lenovo ThinkPad T", count: 3, selected: false }]);
  });

  it("seeria filter filtreerib päriselt; vana üldine ?series=thinkpad leiab kõik ThinkPadi alamseeriad (avalehe lingid)", async () => {
    const base = await baseItem();
    const items = REAL_LENOVO_MODELS.map(([series, model], i) => item(base, `L${i}`, { brand: "lenovo", series, model }));
    const x1 = filterItems(items, parseCatalogQuery({ series: "thinkpad-x1" }));
    expect(x1.map((i) => i.product.model)).toEqual(["X1 2-in-1 G9", "X1 Carbon G10", "X1 Extreme G4", "X1 Yoga G5"]);
    const allThinkPad = filterItems(items, parseCatalogQuery({ series: "thinkpad" }));
    expect(allThinkPad).toHaveLength(REAL_LENOVO_MODELS.filter(([series]) => series === "ThinkPad").length);
    const selected = computeFacets(items, parseCatalogQuery({ series: "thinkpad" })).multi.series.find((o) => o.value === "thinkpad");
    expect(selected).toMatchObject({ selected: true, count: allThinkPad.length, label: seriesLabel("thinkpad") });
  });
});

describe("filtrid: protsessorid", () => {
  it("Apple, Core Ultra 9 ja Ryzen AI tuletatakse nimest, kui andmebaasis perekond puudub", () => {
    expect(cpuFilterFamily({ model: "Apple M2 CPU 8-core", family: null, generationKey: null })).toBe("apple-m2");
    expect(cpuFilterFamily({ model: "Apple M2 Pro CPU 12-core", family: null, generationKey: null })).toBe("apple-m2-pro");
    expect(cpuFilterFamily({ model: "Apple M4 Max", family: null, generationKey: null })).toBe("apple-m4-max");
    expect(cpuFilterFamily({ model: "Intel Core Ultra 9 185H", family: null, generationKey: "ultra-1" })).toBe("intel-core-ultra-9");
    expect(cpuFilterFamily({ model: "AMD AI 7 PRO 360", family: null, generationKey: null })).toBe("amd-ryzen-ai-7");
    // Andmebaasi (tarnija/admini) väärtus on eelistatud
    expect(cpuFilterFamily({ model: "Intel Core i5-1235U", family: "intel-core-i7", generationKey: "intel-12" })).toBe("intel-core-i7");
    expect(cpuFamilyLabel("apple-m2-pro")).toBe("Apple M2 Pro");
    expect(cpuFamilyLabel("amd-ryzen-ai-7")).toBe("AMD Ryzen AI 7");
  });

  it("Apple CPU-d jõuavad protsessorifiltrisse ja valitud Apple filter päriselt filtreerib", async () => {
    const base = await baseItem();
    const items = [
      item(base, "MBA", { brand: "apple", series: "MacBook Air", model: "M2 2022" }, { model: "Apple M2 CPU 8-core", family: null, generationKey: null }),
      item(base, "MBP", { brand: "apple", series: "MacBook Pro", model: "M2 Pro 2023" }, { model: "Apple M2 Pro CPU 12-core", family: null, generationKey: null }),
      item(base, "T14", { brand: "lenovo", series: "ThinkPad", model: "T14 Gen 4" }, { model: "Intel Core i5-1345U", family: "intel-core-i5", generationKey: "intel-13" }),
    ];
    const cpu = computeFacets(items, emptyQuery()).multi.cpu.map((o) => `${o.label} (${o.count})`);
    expect(cpu).toEqual(["Intel Core i5 (1)", "Apple M2 (1)", "Apple M2 Pro (1)"]);
    expect(filterItems(items, parseCatalogQuery({ cpu: "apple-m2" })).map((i) => i.variant.id)).toEqual(["MBA"]);
    expect(filterItems(items, parseCatalogQuery({ cpu: ["apple-m2", "apple-m2-pro"] })).map((i) => i.variant.id)).toEqual(["MBA", "MBP"]);
    const gen = computeFacets(items, emptyQuery()).multi.gen.map((o) => o.label);
    expect(gen).toEqual(["Intel 13. põlvkond", "Apple M2"]);
  });

  it("perekonnad tootja kaupa: Intel Core → Core Ultra → Ryzen → Ryzen AI → Apple", () => {
    const families = ["apple-m2", "amd-ryzen-7", "intel-core-ultra-7", "intel-core-i7", "amd-ryzen-ai-7", "intel-core-i5", "apple-m1", "apple-m2-pro"];
    expect([...families].sort(compareCpuFamilies)).toEqual([
      "intel-core-i5",
      "intel-core-i7",
      "intel-core-ultra-7",
      "amd-ryzen-7",
      "amd-ryzen-ai-7",
      "apple-m1",
      "apple-m2",
      "apple-m2-pro",
    ]);
  });

  it("põlvkonnad: numbriline, uuem eespool, tootja kaupa (mitte tähestik ega ühine skaala)", () => {
    const keys = ["intel-10", "intel-8", "amd-5000", "intel-13", "ultra-1", "apple-2", "intel-11", "amd-7000", "ultra-2", "intel-9", "amdai-300", "apple-1", "intel-12"];
    expect([...keys].sort(compareCpuGenerations)).toEqual([
      "ultra-2",
      "ultra-1",
      "intel-13",
      "intel-12",
      "intel-11",
      "intel-10",
      "intel-9",
      "intel-8",
      "amdai-300",
      "amd-7000",
      "amd-5000",
      "apple-2",
      "apple-1",
    ]);
    expect(cpuFilterGeneration({ model: "AMD AI 7 PRO 360", family: null, generationKey: null })).toBe("amdai-300");
    expect(cpuFilterGeneration({ model: "Apple M2 Pro CPU 12-core", family: null, generationKey: null })).toBe("apple-2");
    expect(FACETS.gen.isValidValue("apple-2") && FACETS.cpu.isValidValue("apple-m2-pro")).toBe(true);
  });
});

describe("Lenovo kuvanimi: Gen N → GN", () => {
  it("Lenovo mudelinimi ja pealkiri", () => {
    expect(displayModelName("lenovo", "T14 Gen 4")).toBe("T14 G4");
    expect(displayModelName("lenovo", "X1 Carbon Gen 10")).toBe("X1 Carbon G10");
    expect(displayModelName("lenovo", "L14 Gen4")).toBe("L14 G4");
    expect(displayProductTitle("lenovo", "ThinkPad", "T14 Gen 4")).toBe("Lenovo ThinkPad T14 G4");
    expect(displayProductTitle("lenovo", "ThinkPad P", "P14s Gen 2")).toBe("Lenovo ThinkPad P14s G2");
  });

  it("teiste tootjate Gen/Generation tekste ei muudeta", () => {
    expect(displayModelName("dell", "Latitude Gen 4")).toBe("Latitude Gen 4");
    expect(displayModelName("hp", "EliteBook 840 G8")).toBe("EliteBook 840 G8");
    expect(displayModelName("lenovo", "Yoga Generation 7")).toBe("Yoga Generation 7");
  });

  it("otsing leiab G4 kuvanimega mudeli nii 'T14 G4' kui 'T14 Gen 4' päringuga; X1 Carbon G10 / Gen 10", async () => {
    const base = await baseItem();
    const t14 = item(base, "T14", { brand: "lenovo", series: "ThinkPad", model: "T14 Gen 4" });
    const x1 = item(base, "X1", { brand: "lenovo", series: "ThinkPad", model: "X1 Carbon Gen 10" });
    expect(t14.product.title).toBe("Lenovo ThinkPad T14 G4");
    for (const query of ["T14 G4", "T14 Gen 4", "t14 gen4".replace("gen4", "gen 4")]) expect(matchesSearch(t14.searchText, tokenize(query))).toBe(true);
    for (const query of ["X1 Carbon G10", "X1 Carbon Gen 10"]) expect(matchesSearch(x1.searchText, tokenize(query))).toBe(true);
    expect(matchesSearch(t14.searchText, tokenize("T14 G5"))).toBe(false);
  });
});

describe("võrdlus: erinevused", () => {
  it("sama väärtus kõigil → rida neutraalne", () => {
    expect(differenceGroups(["16 GB", "16 GB", "16 GB"])).toEqual([null, null, null]);
    expect(rowHasDifferences(["Jah", "Jah"])).toBe(false);
  });

  it("erinevad väärtused saavad rühma; võrdsed väärtused sama rühma", () => {
    expect(differenceGroups(["16 GB", "32 GB", "16 GB"])).toEqual([0, 1, 0]);
    expect(differenceGroups(["8 GB", "16 GB", "32 GB"])).toEqual([0, 1, 2]);
    expect(rowHasDifferences(["Jah", "Ei"])).toBe(true);
  });

  it("sama väärtuse eri kirjapildid ei ole erinevus", () => {
    expect(normalizeCompareValue("16 GB")).toBe(normalizeCompareValue("16GB"));
    expect(normalizeCompareValue("1920 × 1080")).toBe(normalizeCompareValue("1920x1080"));
    expect(differenceGroups(["16 GB", "16GB"])).toEqual([null, null]);
    expect(differenceGroups(["14\"", "14 \""])).toEqual([null, null]);
  });
});

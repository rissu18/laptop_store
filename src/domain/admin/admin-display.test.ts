import { describe, expect, it } from "vitest";
import { filterModelOptions } from "@/components/admin/model-combobox";
import { performanceIssuesOf } from "./data-quality-rules";
import { adminModelTitle, supplierLabel } from "./display";
import { issueHref, parseDataQualityScope } from "./scope";

describe("tarnija veerg", () => {
  it("koodid → nimed (sama mis poe filtris)", () => {
    expect(supplierLabel("laptopid")).toBe("Laptopid.ee");
    expect(supplierLabel("tech")).toBe("Techvision");
    expect(supplierLabel("foxway")).toBe("Foxway");
    expect(supplierLabel("FOXWAY")).toBe("Foxway");
    expect(supplierLabel("mock")).toBe("Mock (test)");
    expect(supplierLabel("uus-tarnija")).toBe("uus-tarnija");
  });
});

describe("mudeli nimi adminis (seeriat ei korrata)", () => {
  it.each([
    [{ manufacturer: "acer", family: "Aspire", model: "Aspire 3 A314-23P" }, "Acer Aspire 3 A314-23P"],
    [{ manufacturer: "acer", family: "Nitro", model: "Nitro 5 AN517-52" }, "Acer Nitro 5 AN517-52"],
    [{ manufacturer: "acer", family: "Swift", model: "Swift Go 14 SFG14-73" }, "Acer Swift Go 14 SFG14-73"],
    [{ manufacturer: "lenovo", family: "ThinkPad", model: "T14 Gen 3" }, "Lenovo ThinkPad T14 G3"],
    [{ manufacturer: "dell", family: "Latitude", model: "5490" }, "Dell Latitude 5490"],
    [{ manufacturer: "tundmatu", family: "Seeria", model: "Seeria X1" }, "tundmatu Seeria X1"],
  ])("%o → %s", (input, expected) => {
    expect(adminModelTitle(input)).toBe(expected);
  });
});

describe("andmekvaliteedi drill-down säilitab skoobi", () => {
  it("vaikimisi skoop on Müügis", () => {
    expect(parseDataQualityScope(undefined)).toBe("sellable");
    expect(parseDataQualityScope("all")).toBe("all");
    expect(parseDataQualityScope("midagi")).toBe("sellable");
  });

  it("mudeli ja konfiguratsiooni kategooriad → õige nimekiri + skoop", () => {
    expect(issueHref("no-images", "sellable")).toBe("/admin/products/models?issue=no-images&scope=sellable");
    expect(issueHref("few-images", "sellable")).toBe("/admin/products/models?issue=few-images&scope=sellable");
    expect(issueHref("icecat-needs-review", "all")).toBe("/admin/images/review?scope=all");
    expect(issueHref("icecat-needs-review", "sellable")).toBe("/admin/images/review");
    expect(issueHref("icecat-not-found", "all")).toBe("/admin/products/models?issue=icecat-not-found");
    expect(issueHref("unknown-keyboard", "sellable")).toBe("/admin/products/listings?issue=unknown-keyboard&scope=sellable");
    expect(issueHref("missing-cpu-benchmark", "all")).toBe("/admin/products/listings?issue=missing-cpu-benchmark");
  });
});

describe("kiirusindeksi puudumine (sama reegel mis tooteleht)", () => {
  it("tarnija väärtus / rikastus / admini CPU parandus", () => {
    expect(performanceIssuesOf({ details: { cpuBenchmark3dmark06: 6235, gpuBenchmark3dmark11: "2 100", cpuMaxMhz: 4400 } })).toEqual([]);
    expect(performanceIssuesOf({ details: {}, enrichment: { cpuBenchmark: { value: 5000 } } })).toEqual(["missing-gpu-benchmark", "missing-cpu-max-mhz"]);
    expect(performanceIssuesOf({ details: { cpuBenchmark3dmark06: 6235, cpuMaxMhz: 4400 }, manualOverrides: { cpu: "Intel Core i7-1255U" } })).toEqual([
      "missing-cpu-benchmark",
      "missing-gpu-benchmark",
      "missing-cpu-max-mhz",
    ]);
    // Vigane väärtus = puudub (0 / tekst / vahemikust väljas)
    expect(performanceIssuesOf({ details: { cpuBenchmark3dmark06: 0, gpuBenchmark3dmark11: "n/a", cpuMaxMhz: 90000 } })).toHaveLength(3);
  });
});

describe("mudeli filter (otsinguga)", () => {
  const options = [
    { id: "1", label: "Lenovo ThinkPad T14 G3" },
    { id: "2", label: "Lenovo ThinkPad T14s G3" },
    { id: "3", label: "Acer Aspire 3 A314-23P" },
  ];
  it("tootja, mudel ja täisnimi; sõnade järjekord ei loe", () => {
    expect(filterModelOptions(options, "acer").map((o) => o.id)).toEqual(["3"]);
    expect(filterModelOptions(options, "t14 lenovo").map((o) => o.id)).toEqual(["1", "2"]);
    expect(filterModelOptions(options, "g3 t14s").map((o) => o.id)).toEqual(["2"]);
    expect(filterModelOptions(options, "Lenovo ThinkPad T14s G3").map((o) => o.id)).toEqual(["2"]);
    expect(filterModelOptions(options, "")).toHaveLength(3);
  });
});

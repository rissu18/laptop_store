import { describe, expect, it } from "vitest";
import { parseCpu, parseDisplay, parseKeyboardLayout, parseRam, parseStorageGb } from "./spec-parsers";

describe("parseCpu", () => {
  it.each([
    ["Intel Core i5-1235U", "intel-core-i5", "intel-12"],
    ["Intel Core i7-1165G7", "intel-core-i7", "intel-11"],
    ["Intel Core i5-8350U", "intel-core-i5", "intel-8"],
    ["Intel Core i7-10610U", "intel-core-i7", "intel-10"],
    ["Intel Core i7-11850H", "intel-core-i7", "intel-11"],
    ["Intel Core i7-1365U vPro", "intel-core-i7", "intel-13"],
    ["Intel Core Ultra 7 155U", "intel-core-ultra-7", "ultra-1"],
    ["Intel Core Ultra 5 125U", "intel-core-ultra-5", "ultra-1"],
    ["AMD Ryzen 5 PRO 5650U", "amd-ryzen-5", "amd-5000"],
    ["AMD Ryzen 7 PRO 5850U", "amd-ryzen-7", "amd-5000"],
    ["AMD Ryzen 5 7530U", "amd-ryzen-5", "amd-7000"],
  ])("%s → %s / %s", (raw, family, generationKey) => {
    expect(parseCpu(raw)).toEqual({ family, generationKey });
  });

  it("tundmatu protsessor ei viska viga; Apple M1 on nüüd tuntud", () => {
    expect(parseCpu("Intel Pentium N5000")).toEqual({ family: null, generationKey: null });
    expect(parseCpu("Apple M1")).toEqual({ family: "apple-m1", generationKey: "apple-1" });
  });
});

describe("parseRam", () => {
  it("loeb suuruse ja tüübi", () => {
    expect(parseRam("16GB DDR4")).toEqual({ gb: 16, type: "DDR4" });
    expect(parseRam("32 GB LPDDR4x")).toEqual({ gb: 32, type: "LPDDR4x" });
    expect(parseRam("8192MB")).toEqual({ gb: 8, type: null });
  });

  it("tagastab null, kui suurust pole", () => {
    expect(parseRam("unknown")).toBeNull();
  });
});

describe("parseStorageGb", () => {
  it("teisendab TB gigabaitideks", () => {
    expect(parseStorageGb("512GB NVMe SSD")).toBe(512);
    expect(parseStorageGb("1TB SSD")).toBe(1024);
    expect(parseStorageGb("2 TB")).toBe(2048);
  });
});

describe("parseDisplay", () => {
  it("loeb suuruse, resolutsiooni, paneeli ja puutetundlikkuse", () => {
    expect(parseDisplay('14" WUXGA 1920x1200 IPS Touch')).toEqual({
      sizeIn: 14,
      resolution: "1920x1200",
      resolutionLabel: "WUXGA",
      panel: "IPS",
      touch: true,
    });
    expect(parseDisplay('15.6" 1920x1080 IPS')?.sizeIn).toBe(15.6);
    expect(parseDisplay('15.6" 1920x1080 IPS')?.touch).toBe(false);
  });
});

describe("parseKeyboardLayout", () => {
  it("ühtlustab tarnijate kirjapildid", () => {
    expect(parseKeyboardLayout("SE")).toBe("SWE");
    expect(parseKeyboardLayout("fi")).toBe("SWE");
    expect(parseKeyboardLayout("NO")).toBe("NOR");
    expect(parseKeyboardLayout("GB")).toBe("UK");
    expect(parseKeyboardLayout("XX")).toBeNull();
    expect(parseKeyboardLayout(null)).toBeNull();
  });
});

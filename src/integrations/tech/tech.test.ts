import { describe, expect, it } from "vitest";
import { BLUE, GRAY, GREEN, LIGHT_GRAY, PURPLE, RED, WHITE, YELLOW, techRow, techSheet, techWorkbook } from "./tech-fixtures";
import { techXlsxExportUrl, readTechConfig } from "./tech-config";
import { isZip } from "./tech-client";
import { classifyTechNotes } from "./tech-notes";
import {
  isNotLaptop,
  normalizeTechCpu,
  normalizeTechGpu,
  parseTechPriceCents,
  parseTechRamGb,
  parseTechScreenSize,
  parseTechStorage,
  techModelName,
  techPurchasePriceCents,
  techSalePriceCents,
} from "./tech-normalizer";
import { parseTechWorkbook } from "./tech-parser";
import { isColoredFill } from "./tech-sheet";
import { TechSnapshotError, buildTechSnapshot, decideTechSnapshotTrust, techListingExternalId } from "./tech-snapshot";

const snapshotOf = (...args: Parameters<typeof techWorkbook>) => buildTechSnapshot(parseTechWorkbook(techWorkbook(...args)));
const statusOf = (row: ReturnType<typeof techRow>) => snapshotOf([row]).rows[0].status;

describe("Tech: seadistus", () => {
  it("XLSX ekspordi URL ehitatakse TECH_SHEET_URL-ist (mitte CSV)", () => {
    const url = techXlsxExportUrl("https://docs.google.com/spreadsheets/d/1XeME_gZ3zCGPIptu7P59wQiw4NLWQOAh0kYMswH2I4o/edit");
    expect(url).toBe("https://docs.google.com/spreadsheets/d/1XeME_gZ3zCGPIptu7P59wQiw4NLWQOAh0kYMswH2I4o/export?format=xlsx");
    expect(url).not.toContain("csv");
    expect(() => techXlsxExportUrl("http://docs.google.com/spreadsheets/d/1XeME_gZ3zCGPIptu7P59wQiw4NLWQOAh0kYMswH2I4o/edit")).toThrow();
    expect(() => techXlsxExportUrl("https://evil.example/spreadsheets/d/1XeME_gZ3zCGPIptu7P59wQiw4NLWQOAh0kYMswH2I4o/edit")).toThrow();
    expect(() => readTechConfig({})).toThrow(/TECH_SHEET_URL/);
  });

  it("XLSX tuvastatakse zip-päise järgi (HTML sisselogimisleht ei ole XLSX)", () => {
    expect(isZip(new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0x14]))).toBe(true);
    expect(isZip(new TextEncoder().encode("<!DOCTYPE html><html>"))).toBe(false);
  });
});

describe("Tech: värvid (Brand/Model fill = müüdud)", () => {
  it.each([
    ["Brand punane", { brandFill: RED }],
    ["Model punane", { modelFill: RED }],
    ["Brand sinine", { brandFill: BLUE }],
    ["Model hall", { modelFill: GRAY }],
    ["Brand kollane", { brandFill: YELLOW }],
    ["Brand roheline", { brandFill: GREEN }],
    ["Brand lilla", { brandFill: PURPLE }],
    ["Brand helehall", { brandFill: LIGHT_GRAY }],
    ["kogu rida punane", { rowFill: RED }],
  ])("%s → müüdud", (_label, fill) => {
    expect(statusOf(techRow(fill))).toBe("SOLD");
  });

  it.each([
    ["täide puudub", {}],
    ["Brand valge", { brandFill: WHITE, modelFill: WHITE }],
    ["ainult hind kollane", { priceFill: YELLOW }],
    ["ainult hind punane", { priceFill: RED }],
  ])("%s → müügis", (_label, fill) => {
    expect(statusOf(techRow(fill))).toBe("AVAILABLE");
  });

  it("ainult K/L märkuse lahter värvitud → ei ole müüdud", () => {
    const sheet = techSheet("Used Laptops ", [techRow({ k: "bl" })]);
    sheet.rows[1].cells[10].fill = { kind: "rgb", argb: "FFFF9900" };
    expect(buildTechSnapshot(parseTechWorkbook([sheet])).rows[0].status).toBe("AVAILABLE");
  });

  it("teema/indekseeritud värvid: valge = värvimata, muu = värvitud; tundmatu muster = värvitud", () => {
    expect(isColoredFill({ kind: "none" })).toBe(false);
    expect(isColoredFill({ kind: "rgb", argb: "FFFFFFFF" })).toBe(false);
    expect(isColoredFill({ kind: "rgb", argb: "00FF0000" })).toBe(false); // läbipaistev
    expect(isColoredFill({ kind: "theme", theme: 0, tint: 0 })).toBe(false);
    expect(isColoredFill({ kind: "theme", theme: 0, tint: -0.15 })).toBe(true);
    expect(isColoredFill({ kind: "theme", theme: 5, tint: 0.4 })).toBe(true);
    expect(isColoredFill({ kind: "indexed", index: 9 })).toBe(false);
    expect(isColoredFill({ kind: "indexed", index: 10 })).toBe(true);
    expect(isColoredFill({ kind: "pattern", pattern: "gray125" })).toBe(true);
  });
});

describe("Tech: märkused (K/L)", () => {
  it.each(["dead battery", "Dead battery", "dead", "no keyboard", "No keyboard", "missing keyboard", "klava x", "hinge", "damage", "laik", "usb", "fan", "touchbar x", "screen", "scr", "bl id scr"])(
    "defekt '%s' → aktiivsest laost välja",
    (note) => {
      expect(classifyTechNotes([note]).defects.length).toBeGreaterThan(0);
      expect(statusOf(techRow({ l: note }))).toBe("DEFECT");
    },
  );

  it("bl / id / 4g / 5g → tunnused (ei välista); id ≠ sõrmejälg", () => {
    expect(classifyTechNotes(["bl"]).features).toEqual({ backlit: true, smartcard: false, lte: false, fiveG: false });
    expect(classifyTechNotes(["id"]).features).toEqual({ backlit: false, smartcard: true, lte: false, fiveG: false });
    expect(classifyTechNotes(["4g"]).features).toMatchObject({ lte: true });
    expect(classifyTechNotes(["bl id"]).features).toMatchObject({ backlit: true, smartcard: true });
    expect(classifyTechNotes(["bl 4g"]).features).toMatchObject({ backlit: true, lte: true });
    expect(classifyTechNotes(["BL ID 4G"]).features).toEqual({ backlit: true, smartcard: true, lte: true, fiveG: false });
    expect(classifyTechNotes(["bl 5G"]).features).toMatchObject({ backlit: true, fiveG: true });
    for (const note of ["bl", "id", "4g", "bl id", "bl 4g", "bl id 4g"]) {
      const unit = snapshotOf([techRow({ k: note })]).rows[0];
      expect(unit.status).toBe("AVAILABLE");
      expect(unit.config!.features).not.toHaveProperty("fingerprint");
    }
  });

  it("e/g/f/w/p, protsendid ja laadija kirjeldus ignoreeritakse (ei välista)", () => {
    for (const note of ["bl e", "bl id g", "f bl", "w", "p", "e+f", "26%", "19%", "hp 65w t.c.", "65w blue", "135w square"]) {
      const result = classifyTechNotes([note]);
      expect(result.unknown).toEqual([]);
      expect(result.defects).toEqual([]);
      expect(statusOf(techRow({ l: note }))).toBe("AVAILABLE");
    }
    expect(classifyTechNotes(["hp 65w t.c."]).charger).toEqual(["hp", "65w", "t.c."]);
    expect(classifyTechNotes(["26%"]).percentages).toEqual(["26%"]);
  });

  it("tundmatu märkus → UNKNOWN_NOTE (ei oletata)", () => {
    for (const note of ["safety", "n-650", "new kb", "L00164734", "0", "type-c", "klava"]) {
      expect(statusOf(techRow({ k: note }))).toBe("UNKNOWN_NOTE");
    }
    const unit = snapshotOf([techRow({ k: "bl", l: "M.M." })]).rows[0];
    expect(unit.status).toBe("UNKNOWN_NOTE");
    expect(unit.notes.unknown).toEqual(["m.m."]);
  });
});

describe("Tech: väärtuste parsimine", () => {
  it("hind: M=380 → ost 360 €, müük 440 €; M=500 → 480 / 560", () => {
    expect(parseTechPriceCents("380")).toBe(38_000);
    expect(techPurchasePriceCents(38_000)).toBe(36_000);
    expect(techSalePriceCents(38_000)).toBe(44_000);
    expect(techPurchasePriceCents(parseTechPriceCents("500")!)).toBe(48_000);
    expect(techSalePriceCents(parseTechPriceCents("500")!)).toBe(56_000);
  });

  it.each([null, "", "-", "abc", "20", "0", "-50", "15"])("vigane hind %j → INVALID (ei leiutata)", (price) => {
    expect(parseTechPriceCents(price)).toBeNull();
    const unit = snapshotOf([techRow({ price })]).rows[0];
    expect(unit.status).toBe("INVALID");
    expect(unit.issues).toContain("INVALID_PRICE");
  });

  it("RAM MB-des, salvestus, ekraan, CPU, GPU", () => {
    expect(parseTechRamGb("16384")).toBe(16);
    expect(parseTechRamGb("12288")).toBe(12);
    expect(parseTechRamGb("4GB")).toBe(4);
    expect(parseTechRamGb("4")).toBeNull();
    expect(parseTechStorage("256 SSD")).toEqual({ gb: 256, type: "SSD" });
    expect(parseTechStorage("500")).toEqual({ gb: 500, type: null });
    expect(parseTechStorage("2 x 500 SSD")).toEqual({ gb: 1000, type: "SSD" });
    expect(parseTechScreenSize('W14"')).toBe(14);
    expect(parseTechScreenSize("W15''")).toBe(15);
    expect(parseTechScreenSize('13"')).toBe(13);
    expect(normalizeTechCpu(" i7-6820HQ")).toBe("Intel Core i7-6820HQ");
    expect(normalizeTechCpu("I7-3612QM")).toBe("Intel Core i7-3612QM");
    expect(normalizeTechCpu("M1 (CPU 8. GPU 8)")).toBe("M1 (CPU 8. GPU 8)");
    expect(normalizeTechGpu("Intel® Iris® Xe Graphics")).toBe("Intel Iris Xe");
    expect(normalizeTechGpu("Intel iris Xe")).toBe("Intel Iris Xe");
    expect(normalizeTechGpu("")).toBeNull();
  });

  it("Tech mudelinimi ühtlustatakse jagatud kanoonilisele kujule (sama slug mis Laptopid.ee)", () => {
    expect(techModelName("ThinkPad X1 Carbon 10th Gen")).toBe("ThinkPad X1 Carbon Gen 10");
    expect(techModelName("Thinkpad X1 Carbon Gen 9")).toBe("ThinkPad X1 Carbon Gen 9");
    const unit = snapshotOf([techRow({ model: "ThinkPad X1 Carbon 10th Gen" })]).rows[0];
    expect(unit.config!.model.slug).toBe("lenovo-thinkpad-x1-carbon-gen-10");
    const t14 = snapshotOf([techRow({ model: "ThinkPad T14 G3" })]).rows[0];
    expect(t14.config!.model.slug).toBe("lenovo-thinkpad-t14-gen-3");
  });

  it("salvestuse tüüp pole SSD (puudub / HDD) → INVALID (pood kuvab SSD — ei väideta)", () => {
    for (const storage of ["500", "2 x 1000", "500 HDD"]) {
      const unit = snapshotOf([techRow({ storage })]).rows[0];
      expect(unit.status).toBe("INVALID");
      expect(unit.issues).toContain("STORAGE_NOT_SSD");
    }
    expect(statusOf(techRow({ storage: "512 SSD" }))).toBe("AVAILABLE");
  });

  it("puuduv Tech ID / seerianumber → INVALID; seerianumbrit ei tükeldata", () => {
    expect(snapshotOf([techRow({ id: null })]).rows[0].issues).toContain("MISSING_ID");
    expect(snapshotOf([techRow({ id: "FVFHF3UZQ05D" })]).rows[0].issues).toContain("MISSING_ID");
    expect(snapshotOf([techRow({ serial: null })]).rows[0].issues).toContain("MISSING_SERIAL");
    expect(snapshotOf([techRow({ serial: "  ABC123, X9  " })]).rows[0].serial).toBe("ABC123, X9");
  });

  it("tahvelarvutid ja eemaldatava ekraaniga 2-in-1 → NOT_LAPTOP; tavaline 2-in-1 (360°) jääb", () => {
    for (const model of ["Tab M10 FHD Plus Tablet", "Surface Go 2", "Surface Pro 7", "Surface Book 3", "Elite x2 G8 Tablet", "Toughpad FZ-G1 mk5", "Toughbook CF-33", "Latitude 7210 2-in-1", "ThinkPad X1 Tablet 3rd Gen"]) {
      expect(isNotLaptop(model, 12)).toBe(true);
    }
    expect(isNotLaptop("Toughbook CF-54 MK2", 14)).toBe(false);
    expect(isNotLaptop("Latitude 7330 2-in-1", 13)).toBe(false);
    expect(isNotLaptop("Surface Laptop 4", 13)).toBe(false);
    expect(isNotLaptop("FZ-M1 Rugged", 7)).toBe(true);
    expect(statusOf(techRow({ brand: "Microsoft", model: "Surface Pro 5" }))).toBe("NOT_LAPTOP");
  });
});

describe("Tech: tabid ja sektsioonid", () => {
  it("Used Laptops / Laptops 2 → sülearvutid; Monitors / Desktops / Parts → ignoreeritakse", () => {
    const parse = parseTechWorkbook([
      techSheet("Used Laptops ", [techRow()]),
      techSheet("Laptops 2", [techRow()]),
      techSheet("Monitors", [techRow({ brand: "Dell", model: "P2419H" })]),
      techSheet("Desktops", [techRow({ brand: "Dell", model: "OptiPlex 7010 Tower" })]),
      techSheet("Parts + Docking stations", [techRow({ brand: "Lenovo", model: "ThinkPad USB-C Dock" })]),
    ]);
    expect(parse.sheets.map((s) => [s.name, s.role, s.laptopRows])).toEqual([
      ["Used Laptops ", "LAPTOPS", 1],
      ["Laptops 2", "LAPTOPS", 1],
      ["Monitors", "IGNORED", 0],
      ["Desktops", "IGNORED", 0],
      ["Parts + Docking stations", "IGNORED", 0],
    ]);
    expect(parse.rows).toHaveLength(2);
  });

  it("segatab (Laptops 3 / Incoming): ainult 'Laptops' sektsioon kuni järgmise pealkirjani", () => {
    const parse = parseTechWorkbook([
      techSheet("Laptops 3", [
        { heading: "Desktops" },
        techRow({ brand: "Dell", model: "OptiPlex 7060 Tower", display: null }),
        { heading: "Doking stations" },
        techRow({ brand: "Lenovo", model: "ThinkPad Thunderbolt 3 Workstation Dock" }),
        { heading: "Laptops" },
        techRow({ model: "ThinkPad T14 Gen 2" }),
        techRow({ model: "ThinkPad T14s Gen 3" }),
      ]),
      techSheet("Incoming 9 31.12", [{ heading: "Monitors" }, techRow({ brand: "Dell", model: "P2419H", display: 'W24"' }), { heading: "Laptops" }, techRow(), { heading: "Desktops" }, techRow({ model: "ThinkCentre M83 Tower" })]),
    ]);
    expect(parse.rows.map((r) => `${r.sheet}:${r.model}`)).toEqual(["Laptops 3:ThinkPad T14 Gen 2", "Laptops 3:ThinkPad T14s Gen 3", "Incoming 9 31.12:ThinkPad T14 Gen 3"]);
    expect(parse.sheets[0].sections.map((s) => [s.title, s.imported])).toEqual([
      ["Desktops", false],
      ["Doking stations", false],
      ["Laptops", true],
    ]);
    expect(parse.layoutErrors).toEqual([]);
  });

  it("Incoming ilma Laptops sektsioonita ja tundmatu tab → ei impordita (ei oletata), hoiatus", () => {
    const parse = parseTechWorkbook([techSheet("Used Laptops ", [techRow()]), techSheet("Incoming 3 01.11", [{ heading: "Monitors" }, techRow()]), techSheet("Misc", [techRow()])]);
    expect(parse.rows).toHaveLength(1);
    expect(parse.warnings).toHaveLength(2);
  });

  it("muutunud veergude päis → tab jäetakse vahele (layout error), snapshot pole usaldusväärne", () => {
    const header = ["", "Brand", "", "", "Processor", "Serial Nr.", "RAM(MB)", "HDD(GB)", "Display", "Resolution", "", "", "Price", "Video"];
    const parse = parseTechWorkbook([techSheet("Used Laptops ", [techRow()]), techSheet("Laptops 2", [techRow()], { header })]);
    expect(parse.rows).toHaveLength(1);
    expect(parse.layoutErrors[0]).toMatch(/Laptops 2/);
    const decision = decideTechSnapshotTrust(buildTechSnapshot(parse), { previouslyAvailableUnitIds: [], previousSoldRows: null });
    expect(decision.trusted).toBe(false);
  });
});

describe("Tech: grupeerimine ja laoseis", () => {
  const four = () => [1, 2, 3, 4].map(() => techRow());

  it("4 sama konfiguratsiooni + hinnaga seadet → 1 pakkumine, laoseis 4, 4 seadet", () => {
    const snapshot = snapshotOf(four());
    expect(snapshot.groups).toHaveLength(1);
    expect(snapshot.groups[0].unitIds).toHaveLength(4);
    expect(snapshot.units).toHaveLength(4);
    expect(snapshot.groups[0].sku).toMatch(/^TC-[0-9A-F]{10}$/);
  });

  it("üks 'bl' → 2 gruppi; üks erineva hinnaga → 2 gruppi", () => {
    const rows = four();
    rows[0].k = "bl";
    expect(snapshotOf(rows).groups.map((g) => g.unitIds.length).sort()).toEqual([1, 3]);
    const priced = four();
    priced[3].price = "390";
    expect(snapshotOf(priced).groups.map((g) => g.unitIds.length).sort()).toEqual([1, 3]);
  });

  it("üks värvitud → laoseis 3; üks 'dead battery' → laoseis 3", () => {
    const colored = four();
    colored[1].brandFill = RED;
    expect(snapshotOf(colored).groups[0].unitIds).toHaveLength(3);
    const defect = four();
    defect[2].l = "dead battery";
    expect(snapshotOf(defect).groups[0].unitIds).toHaveLength(3);
  });

  it("pakkumise ID on deterministlik (ei sõltu reast, tabist ega seerianumbrist)", () => {
    const a = snapshotOf([techRow()]).groups[0].externalId;
    const b = buildTechSnapshot(parseTechWorkbook([techSheet("Laptops 2", [techRow({ serial: "OTHER0001" }), techRow()])])).groups[0].externalId;
    expect(a).toBe(b);
    expect(techListingExternalId(snapshotOf([techRow({ price: "381" })]).groups[0].config)).not.toBe(a);
  });

  it("sama Tech ID mitmes tabis: identne → üks seade; erinevad andmed → konflikt, müügist välja", () => {
    const row = techRow();
    const dup = buildTechSnapshot(parseTechWorkbook([techSheet("Used Laptops ", [row]), techSheet("Laptops 2", [{ ...row }])]));
    expect(dup.units).toHaveLength(1);
    expect(dup.counts.duplicateRowsMerged).toBe(1);
    expect(dup.groups[0].unitIds).toEqual([row.id]);
    const conflict = buildTechSnapshot(parseTechWorkbook([techSheet("Used Laptops ", [row]), techSheet("Laptops 2", [{ ...row, ram: "8192" }])]));
    expect(conflict.units[0].status).toBe("CONFLICT");
    expect(conflict.groups).toHaveLength(0);
    expect(conflict.counts.conflicts).toBe(1);
  });
});

describe("Tech: snapshot'i usaldusväärsus", () => {
  const rows = () => Array.from({ length: 12 }, () => techRow());

  it("stiiliinfo puudub täielikult → fataalne (ei eeldata, et kõik on müügis)", () => {
    const snapshot = buildTechSnapshot(parseTechWorkbook([techSheet("Used Laptops ", rows(), { noFills: true })]));
    expect(() => decideTechSnapshotTrust(snapshot, { previouslyAvailableUnitIds: [], previousSoldRows: null })).toThrow(TechSnapshotError);
  });

  it("eelmises snapshot'is palju müüdud ridu, nüüd 0 värvitud → fataalne COLOR_DROP", () => {
    const snapshot = snapshotOf(rows());
    expect(() => decideTechSnapshotTrust(snapshot, { previouslyAvailableUnitIds: [], previousSoldRows: 40 })).toThrow(/COLOR_DROP|värvitud/);
    expect(() => decideTechSnapshotTrust(snapshot, { previouslyAvailableUnitIds: [], previousSoldRows: null })).not.toThrow();
  });

  it("hinda ei õnnestu massiliselt lugeda → fataalne", () => {
    const snapshot = snapshotOf(rows().map((r) => ({ ...r, price: "?" })));
    expect(() => decideTechSnapshotTrust(snapshot, { previouslyAvailableUnitIds: [], previousSoldRows: null })).toThrow(/PRICE|Hinda/);
  });

  it("sülearvutite tabe pole → fataalne", () => {
    const snapshot = buildTechSnapshot(parseTechWorkbook([techSheet("Monitors", rows())]));
    expect(() => decideTechSnapshotTrust(snapshot, { previouslyAvailableUnitIds: [], previousSoldRows: null })).toThrow(/NO_LAPTOP|tabe/);
  });

  it("suur kadu (üle poole müügis seadmetest) → fataalne, kui admin ei luba", () => {
    const snapshot = snapshotOf(rows());
    const previous = Array.from({ length: 40 }, (_, i) => String(9_000_000 + i));
    expect(() => decideTechSnapshotTrust(snapshot, { previouslyAvailableUnitIds: previous, previousSoldRows: null })).toThrow(/LARGE_DROP|korraga/);
    const allowed = decideTechSnapshotTrust(snapshot, { previouslyAvailableUnitIds: previous, previousSoldRows: null }, { allowLargeDrop: true });
    expect(allowed.trusted).toBe(true);
    expect(allowed.missingIds).toHaveLength(40);
  });

  it("puuduvaid on palju (aga mitte fataalselt) → puuduvaid maha ei võeta", () => {
    const current = rows();
    const previous = [...current.map((r) => r.id!), ...Array.from({ length: 11 }, (_, i) => String(9_100_000 + i))];
    const decision = decideTechSnapshotTrust(snapshotOf(current), { previouslyAvailableUnitIds: previous, previousSoldRows: null });
    expect(decision.trusted).toBe(false);
    expect(decision.missingIds).toHaveLength(11);
  });
});

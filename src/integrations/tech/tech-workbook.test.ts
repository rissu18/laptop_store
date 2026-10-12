import ExcelJS from "exceljs";
import { describe, expect, it } from "vitest";
import { parseTechWorkbook } from "./tech-parser";
import { buildTechSnapshot } from "./tech-snapshot";
import { readTechWorkbook } from "./tech-workbook";

/**
 * Päris XLSX (ExcelJS-iga kirjutatud, nagu Google Sheetsi eksport): lahtrite taustavärvid peavad lugemisel säilima.
 * See on põhjus, miks CSV-d ei kasutata.
 */

const solid = (argb: string): ExcelJS.Fill => ({ type: "pattern", pattern: "solid", fgColor: { argb } });

async function buildXlsx(): Promise<Uint8Array> {
  const workbook = new ExcelJS.Workbook();
  const used = workbook.addWorksheet("Used Laptops ");
  used.addRow(["", "Brand", "", "", "Serial Nr.", "Processor", "RAM(MB)", "HDD(GB)", "Display", "Resolution", "", "", "Price", "Video"]);
  used.getRow(1).eachCell((cell) => (cell.fill = solid("FFFFFF00")));
  const rows: (string | number)[][] = [
    ["", "Lenovo", "ThinkPad T14 Gen 3", 1000001, "TESTSN00001", "i5-1235U", 16384, "256 SSD", 'W14"', "1920x1200 IPS", "bl id", "", 380, "Intel Iris Xe"],
    ["", "Lenovo", "ThinkPad T14 Gen 3", 1000002, "TESTSN00002", "i5-1235U", 16384, "256 SSD", 'W14"', "1920x1200 IPS", "bl id", "", 380, "Intel Iris Xe"],
    ["", "Dell", "Latitude 5420", 1000003, "TESTSN00003", "i5-1145G7", 16384, "256 SSD", 'W14"', "1920x1080 IPS", "", "", 280, "Intel Iris Xe"],
    ["", "Dell", "Latitude 5420", 1000004, "TESTSN00004", "i5-1145G7", 16384, "256 SSD", 'W14"', "1920x1080 IPS", "", "", 280, "Intel Iris Xe"],
  ];
  for (const values of rows) used.addRow(values);
  used.getCell("M2").fill = solid("FFFFFF00"); // hinna lahter kollane — EI tähenda müüdud
  used.getCell("B3").fill = solid("FFFF0000"); // punane Brand → müüdud
  used.getCell("C4").fill = solid("FF0000FF"); // sinine Model → müüdud
  used.getCell("B5").fill = solid("FFFFFFFF"); // valge → müügis
  const mixed = workbook.addWorksheet("Incoming 1 07.10");
  mixed.addRow(["", "Brand", "Model", "", "Serial Nr.", "Processor", "RAM(MB)", "HDD(GB)", "Display", "Resolution", "", "", "Price"]);
  mixed.addRow(["", "Monitors"]);
  mixed.mergeCells("B2:K2");
  mixed.addRow(["", "Dell", "P2419H", 2000001, "MONSN0001", "", "", "", 'W24"', "1920x1080 IPS", "", "", 60]);
  mixed.addRow(["", "Laptops"]);
  mixed.mergeCells("B4:K4");
  mixed.addRow(["", "HP", "EliteBook 840 G9", 2000002, "TESTSN00005", "i5-1245U", 16384, "512 SSD", 'W14"', "1920x1200 IPS", "", "", 420, "Intel Iris Xe"]);
  workbook.addWorksheet("Monitors").addRow(["", "Brand", "Model"]);
  return new Uint8Array(await workbook.xlsx.writeBuffer());
}

describe("Tech XLSX lugemine (ExcelJS)", () => {
  it("loeb väärtused ja taustavärvid; Brand/Model fill = müüdud, hinna fill ei loe", async () => {
    const sheets = await readTechWorkbook(await buildXlsx());
    expect(sheets.map((s) => s.name)).toEqual(["Used Laptops ", "Incoming 1 07.10", "Monitors"]);
    const snapshot = buildTechSnapshot(parseTechWorkbook(sheets));
    expect(snapshot.rows.map((r) => [r.externalUnitId, r.status])).toEqual([
      ["1000001", "AVAILABLE"],
      ["1000002", "SOLD"],
      ["1000003", "SOLD"],
      ["1000004", "AVAILABLE"],
      ["2000002", "AVAILABLE"],
    ]);
    expect(snapshot.rows[0].config).toMatchObject({ ramGb: 16, storageGb: 256, sourcePriceCents: 38_000, features: { backlit: true, smartcard: true } });
    expect(snapshot.parse.sheets[1].sections.map((s) => [s.title, s.imported])).toEqual([
      ["Monitors", false],
      ["Laptops", true],
    ]);
  });

  it("vigane fail → selge viga", async () => {
    await expect(readTechWorkbook(new TextEncoder().encode("<html>login</html>"))).rejects.toThrow(/XLSX/);
  });
});

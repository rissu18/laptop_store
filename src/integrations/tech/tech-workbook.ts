import "server-only";
import ExcelJS from "exceljs";
import type { CellFill, SheetCell, SheetData, SheetRow } from "./tech-sheet";

/**
 * XLSX (Google Sheetsi eksport) → lihtne andmekuju: iga lahtri tekst + taustatäide (fill).
 * AINULT serveris. CSV-d ei kasutata: müüdud seadmed on tähistatud Brand/Model lahtri taustavärviga ja CSV
 * kaotab selle info. ExcelJS on siin ainsas failis — parser (tech-parser.ts) töötab SheetData kujuga ja on
 * testitav ilma XLSX-failita.
 */

/** Loeme veerud A…O (Techi laptopi read kasutavad B…N) */
const MAX_COLUMN = 15;
/** Kaitse vigase/hiiglasliku faili vastu */
const MAX_ROWS_PER_SHEET = 5_000;

export class TechWorkbookError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TechWorkbookError";
  }
}

export async function readTechWorkbook(data: Uint8Array): Promise<SheetData[]> {
  const workbook = new ExcelJS.Workbook();
  try {
    // ExcelJS tüübid ootavad Node Bufferit
    await workbook.xlsx.load(Buffer.from(data) as unknown as ArrayBuffer);
  } catch (error) {
    throw new TechWorkbookError(`XLSX-i ei õnnestunud avada: ${error instanceof Error ? error.message : String(error)}`);
  }
  return workbook.worksheets.map((sheet) => {
    const rows: SheetRow[] = [];
    let filledCells = 0;
    sheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
      if (rowNumber > MAX_ROWS_PER_SHEET) return;
      const cells: SheetCell[] = [];
      for (let column = 1; column <= MAX_COLUMN; column++) {
        const cell = row.getCell(column);
        const fill = readFill(cell.fill);
        if (fill.kind !== "none") filledCells++;
        cells.push({ text: cellText(cell.value), fill });
      }
      rows.push({ rowNumber, cells });
    });
    const merges = ((sheet.model as { merges?: string[] }).merges ?? []).slice();
    return { name: sheet.name, state: sheet.state, rows, merges, filledCells };
  });
}

function readFill(fill: ExcelJS.Fill | undefined): CellFill {
  if (!fill || fill.type !== "pattern" || !fill.pattern || fill.pattern === "none") return { kind: "none" };
  const color = fill.pattern === "solid" ? fill.fgColor : (fill.fgColor ?? fill.bgColor);
  if (!color) return { kind: "pattern", pattern: fill.pattern };
  const c = color as { argb?: string; theme?: number; tint?: number; indexed?: number };
  if (typeof c.argb === "string") return { kind: "rgb", argb: c.argb.toUpperCase(), pattern: fill.pattern };
  if (typeof c.theme === "number") return { kind: "theme", theme: c.theme, tint: c.tint ?? 0, pattern: fill.pattern };
  if (typeof c.indexed === "number") return { kind: "indexed", index: c.indexed, pattern: fill.pattern };
  return { kind: "pattern", pattern: fill.pattern };
}

/** Lahtri väärtus tekstina (kuupäev ISO kujul, valem → tulemus, rich text → tekst). Tühi → null. */
function cellText(value: ExcelJS.CellValue): string | null {
  if (value === null || value === undefined) return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value.toISOString().slice(0, 10);
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (typeof value === "string") return value.trim() ? value : null;
  if (typeof value === "object") {
    if ("richText" in value && Array.isArray(value.richText)) return cellText(value.richText.map((part) => part.text).join(""));
    if ("formula" in value || "sharedFormula" in value) return cellText((value as { result?: ExcelJS.CellValue }).result ?? null);
    if ("text" in value && typeof value.text === "string") return cellText(value.text);
    if ("error" in value) return null;
  }
  return null;
}

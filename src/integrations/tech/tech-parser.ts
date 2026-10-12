import { COL, cellFill, cellText, describeFill, isColoredFill, type CellFill, type SheetData, type SheetRow } from "./tech-sheet";

/**
 * Tech hinnakiri (töövihik) → sülearvutite toorread. Ainult sülearvutid:
 *
 *   - tabid nimega Monitors / Desktops / Parts / Docking → ignoreeritakse täielikult;
 *   - kategooria pealkirjadega tab (nt "Laptops 3", "Incoming …"): ainult pealkirja "Laptops" alla jäävad read
 *     kuni järgmise pealkirjani (Desktops, Monitors, Docking stations …);
 *   - pealkirjadeta tab, mille nimi sisaldab "laptop" (nt "Used Laptops ", "Laptops 2") → kogu tab on sülearvutid;
 *   - muu tab (nt "Incoming" ilma "Laptops" pealkirjata) → midagi ei impordita, hoiatus. Ei oletata.
 *
 * Veergude asukoht kontrollitakse päisereast (Brand / Serial Nr. / Processor / RAM / HDD / Display / Resolution).
 * Kui päis ei vasta, jäetakse kogu tab vahele (layout error) — vigaseid ridu ei impordita.
 * Tabide nimed (sh kuupäevad "Incoming 1 07.10") võivad muutuda — loogika ei sõltu konkreetsest nimest.
 */

export type TechSheetRole = "LAPTOPS" | "SECTIONED" | "IGNORED" | "UNKNOWN";

export interface TechSectionReport {
  title: string;
  fromRow: number;
  toRow: number | null;
  imported: boolean;
}

export interface TechSheetReport {
  name: string;
  role: TechSheetRole;
  sections: TechSectionReport[];
  laptopRows: number;
  filledCells: number;
  /** Tabi ei saanud turvaliselt lugeda — selle read jäid importimata */
  layoutError: string | null;
  warning: string | null;
}

export interface TechSourceRow {
  sheet: string;
  rowNumber: number;
  brand: string | null;
  model: string | null;
  /** D — Techi sisemine seadme ID */
  techId: string | null;
  /** E — seerianumber (algkujul, trim) */
  serial: string | null;
  processor: string | null;
  ram: string | null;
  storage: string | null;
  display: string | null;
  resolution: string | null;
  noteK: string | null;
  noteL: string | null;
  price: string | null;
  video: string | null;
  brandFill: string | null;
  modelFill: string | null;
  /** Brand (B) või Model (C) lahter on nähtavalt värvitud → seade on müüdud */
  colored: boolean;
}

export interface TechParseResult {
  sheets: TechSheetReport[];
  rows: TechSourceRow[];
  /** Tabid, kus võis olla sülearvuteid, aga layout'i ei saanud turvaliselt lugeda */
  layoutErrors: string[];
  warnings: string[];
  /** Mitu sülearvuti-allikat (tab või sektsioon) loeti edukalt */
  laptopSources: number;
  /** Taustatäitega lahtreid sülearvuti-allikate tabides (stiiliinfo olemasolu kontroll) */
  filledCellsInLaptopSheets: number;
}

const IGNORED_SHEET = /monitor|desktop|\bparts?\b|dock/i;
const LAPTOP_SHEET = /laptop/i;
const LAPTOP_HEADING = /^(laptops?|notebooks?|sülearvutid)$/i;

/** Päise kontroll: veerg → oodatud pealkiri */
const HEADER_EXPECTATIONS: { column: number; pattern: RegExp; label: string }[] = [
  { column: COL.B, pattern: /^brand$/i, label: "B=Brand" },
  { column: COL.E, pattern: /serial/i, label: "E=Serial Nr." },
  { column: COL.F, pattern: /processor|cpu/i, label: "F=Processor" },
  { column: COL.G, pattern: /ram/i, label: "G=RAM(MB)" },
  { column: COL.H, pattern: /hdd|ssd|storage/i, label: "H=HDD(GB)" },
  { column: COL.I, pattern: /display/i, label: "I=Display" },
  { column: COL.J, pattern: /resolution/i, label: "J=Resolution" },
];

function isHeaderRow(row: SheetRow): boolean {
  return /^brand$/i.test(cellText(row, COL.B) ?? "");
}

function headerProblems(row: SheetRow): string[] {
  return HEADER_EXPECTATIONS.filter((e) => !e.pattern.test(cellText(row, e.column) ?? "")).map((e) => e.label);
}

/** Ühendatud vahemikud, mis algavad veerust B ja katavad vähemalt veerud B…E → rea number */
function mergedHeadingRows(merges: string[]): Set<number> {
  const rows = new Set<number>();
  for (const range of merges) {
    const match = range.match(/^B(\d+):([A-Z]+)(\d+)$/);
    if (!match) continue;
    const [, startRow, endCol, endRow] = match;
    if (startRow === endRow && endCol.length === 1 && endCol >= "E") rows.add(Number(startRow));
  }
  return rows;
}

/** Kategooria pealkiri: ühendatud B…K lahter või vähemalt 3 sama teksti veergudes B…K (Sheetsi eksport kordab väärtust) */
function headingTitle(row: SheetRow, mergedRows: Set<number>): string | null {
  const values: string[] = [];
  for (let c = COL.B; c <= COL.K; c++) {
    const text = cellText(row, c);
    if (text) values.push(text);
  }
  if (!values.length) return null;
  const allSame = values.every((v) => v === values[0]);
  if (mergedRows.has(row.rowNumber) && allSame) return values[0];
  if (values.length >= 3 && allSame) return values[0];
  return null;
}

function toSourceRow(sheet: string, row: SheetRow): TechSourceRow {
  const brandFill: CellFill = cellFill(row, COL.B);
  const modelFill: CellFill = cellFill(row, COL.C);
  // Seerianumber: ainult trim — koma või lisakoodi EI tükeldata
  const serial = row.cells[COL.E]?.text?.trim() || null;
  return {
    sheet,
    rowNumber: row.rowNumber,
    brand: cellText(row, COL.B),
    model: cellText(row, COL.C),
    techId: cellText(row, COL.D),
    serial,
    processor: cellText(row, COL.F),
    ram: cellText(row, COL.G),
    storage: cellText(row, COL.H),
    display: cellText(row, COL.I),
    resolution: cellText(row, COL.J),
    noteK: cellText(row, COL.K),
    noteL: cellText(row, COL.L),
    price: cellText(row, COL.M),
    video: cellText(row, COL.N),
    brandFill: describeFill(brandFill),
    modelFill: describeFill(modelFill),
    colored: isColoredFill(brandFill) || isColoredFill(modelFill),
  };
}

export function parseTechWorkbook(sheets: SheetData[]): TechParseResult {
  const result: TechParseResult = { sheets: [], rows: [], layoutErrors: [], warnings: [], laptopSources: 0, filledCellsInLaptopSheets: 0 };

  for (const sheet of sheets) {
    const name = sheet.name.trim();
    const report: TechSheetReport = { name: sheet.name, role: "UNKNOWN", sections: [], laptopRows: 0, filledCells: sheet.filledCells, layoutError: null, warning: null };
    result.sheets.push(report);
    if (IGNORED_SHEET.test(name)) {
      report.role = "IGNORED";
      continue;
    }

    const mergedRows = mergedHeadingRows(sheet.merges);
    const headings = sheet.rows.map((row) => ({ row, title: headingTitle(row, mergedRows) })).filter((h): h is { row: SheetRow; title: string } => h.title !== null);
    // Pealkirjadeta tab: ainult siis sülearvutid, kui nimi seda ütleb
    if (!headings.length && !LAPTOP_SHEET.test(name)) {
      report.warning = `Tab "${name}": kategooria pealkirju ega "Laptop" nime pole — ei impordita`;
      result.warnings.push(report.warning);
      continue;
    }
    report.role = headings.length ? "SECTIONED" : "LAPTOPS";

    // Laptop-vahemikud (reanumbrid)
    const ranges: { from: number; to: number | null }[] = [];
    if (headings.length) {
      headings.forEach((h, i) => {
        const to = headings[i + 1]?.row.rowNumber ?? null;
        const imported = LAPTOP_HEADING.test(h.title);
        report.sections.push({ title: h.title, fromRow: h.row.rowNumber, toRow: to === null ? null : to - 1, imported });
        if (imported) ranges.push({ from: h.row.rowNumber + 1, to: to === null ? null : to - 1 });
      });
      if (!ranges.length) {
        const message = `Tab "${name}": "Laptops" sektsiooni ei leitud (sektsioonid: ${headings.map((h) => h.title).join(", ")}) — ei impordita`;
        if (LAPTOP_SHEET.test(name)) {
          report.layoutError = message;
          result.layoutErrors.push(message);
        } else {
          report.warning = message;
          result.warnings.push(message);
        }
        continue;
      }
    } else {
      ranges.push({ from: 1, to: null });
    }

    // Päis peab olema enne esimest kategooria pealkirja (ja seega enne andmeid) ning veerud peavad vastama
    const header = sheet.rows.find(isHeaderRow);
    const problems = !header ? ["päiserida (Brand) puudub"] : headings.length && header.rowNumber > headings[0].row.rowNumber ? ["päis on pärast sektsioone"] : headerProblems(header);
    if (!header || problems.length) {
      const message = `Tab "${name}": veergude päis ei vasta oodatule (${problems.join(", ")}) — tab jäeti vahele`;
      report.layoutError = message;
      result.layoutErrors.push(message);
      continue;
    }

    result.laptopSources += ranges.length;
    result.filledCellsInLaptopSheets += sheet.filledCells;
    const headingRowNumbers = new Set(headings.map((h) => h.row.rowNumber));
    for (const row of sheet.rows) {
      if (row.rowNumber <= header.rowNumber || headingRowNumbers.has(row.rowNumber) || isHeaderRow(row)) continue;
      if (!ranges.some((r) => row.rowNumber >= r.from && (r.to === null || row.rowNumber <= r.to))) continue;
      const source = toSourceRow(sheet.name, row);
      if (!source.brand && !source.model) continue;
      report.laptopRows++;
      result.rows.push(source);
    }
  }
  return result;
}

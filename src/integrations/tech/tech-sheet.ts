/**
 * Tech hinnakirja (Google Sheets → XLSX) lihtne andmekuju, millega parser töötab.
 * Puhas TypeScript (ilma ExcelJS-ita) — testid ehitavad selle kuju otse.
 */

export type CellFill =
  | { kind: "none" }
  | { kind: "rgb"; argb: string; pattern?: string }
  | { kind: "theme"; theme: number; tint: number; pattern?: string }
  | { kind: "indexed"; index: number; pattern?: string }
  /** Mustriga täide, mille värvi ei õnnestunud lugeda */
  | { kind: "pattern"; pattern: string };

export interface SheetCell {
  /** Lahtri väärtus tekstina (trim'imata); tühi lahter = null */
  text: string | null;
  fill: CellFill;
}

export interface SheetRow {
  /** 1-põhine reanumber nagu Google Sheetsis */
  rowNumber: number;
  /** Veerud A… (indeks 0 = A) */
  cells: SheetCell[];
}

export interface SheetData {
  name: string;
  state?: string;
  rows: SheetRow[];
  /** Ühendatud lahtrid, nt "B2:K2" (kategooria pealkirjad) */
  merges: string[];
  /** Mitu lahtrit (A…O) on mistahes taustatäitega — stiiliinfo olemasolu kontroll */
  filledCells: number;
}

/** Veergude indeksid (A = 0) */
export const COL = { A: 0, B: 1, C: 2, D: 3, E: 4, F: 5, G: 6, H: 7, I: 8, J: 9, K: 10, L: 11, M: 12, N: 13 } as const;

/** Valge (või läbipaistev) taust = värvimata. Teisi toone EI tõlgendata: iga muu nähtav täide = värvitud. */
const WHITE_RGB = "FFFFFF";
/** Excel/Sheets teema 0 = "Background 1" (valge); indekseeritud 9 = valge, 64 = süsteemi taust */
const WHITE_THEME = 0;
const WHITE_INDEXED = new Set([9, 64]);

/**
 * Kas lahtril on nähtav mitte-valge taust? Värvi toon ei loe — punane, sinine, hall, kollane, roheline,
 * lilla jne tähendavad Brand/Model lahtris sama: seade on müüdud. Tundmatu täide → värvitud (konservatiivne:
 * pigem jääb seade müügist välja kui müüakse juba müüdud seadet).
 */
export function isColoredFill(fill: CellFill): boolean {
  switch (fill.kind) {
    case "none":
      return false;
    case "rgb": {
      const argb = fill.argb.toUpperCase();
      const alpha = argb.length === 8 ? argb.slice(0, 2) : "FF";
      if (alpha === "00") return false; // täiesti läbipaistev
      return argb.slice(-6) !== WHITE_RGB;
    }
    case "theme":
      return !(fill.theme === WHITE_THEME && fill.tint >= 0);
    case "indexed":
      return !WHITE_INDEXED.has(fill.index);
    case "pattern":
      return true;
  }
}

export function cellText(row: SheetRow, column: number): string | null {
  const text = row.cells[column]?.text;
  if (text === null || text === undefined) return null;
  const trimmed = text.replace(/\s+/g, " ").trim();
  return trimmed ? trimmed : null;
}

export function cellFill(row: SheetRow, column: number): CellFill {
  return row.cells[column]?.fill ?? { kind: "none" };
}

/** Lühike, logides kasutatav värvi kirjeldus (nt "FFFF0000") */
export function describeFill(fill: CellFill): string | null {
  switch (fill.kind) {
    case "none":
      return null;
    case "rgb":
      return fill.argb;
    case "theme":
      return `theme:${fill.theme}${fill.tint ? `:${fill.tint}` : ""}`;
    case "indexed":
      return `indexed:${fill.index}`;
    case "pattern":
      return `pattern:${fill.pattern}`;
  }
}

import type { CellFill, SheetCell, SheetData, SheetRow } from "./tech-sheet";

/**
 * Testandmed Techi hinnakirja kujul (fiktiivsed Tech ID-d ja seerianumbrid — päris seerianumbreid repos ei hoita).
 * Veerud: B Brand, C Model, D Tech ID, E Serial, F CPU, G RAM(MB), H HDD, I Display, J Resolution, K/L märkused,
 * M hind, N GPU.
 */

export interface TechFixtureRow {
  brand?: string | null;
  model?: string | null;
  id?: string | null;
  serial?: string | null;
  cpu?: string | null;
  ram?: string | null;
  storage?: string | null;
  display?: string | null;
  resolution?: string | null;
  k?: string | null;
  l?: string | null;
  price?: string | null;
  gpu?: string | null;
  /** Taustavärv ARGB-na (nt "FFFF0000") või täielik CellFill */
  brandFill?: string | CellFill;
  modelFill?: string | CellFill;
  priceFill?: string | CellFill;
  /** Kogu rea taust (nagu Sheetsis terve rea värvimisel) */
  rowFill?: string | CellFill;
}

export const YELLOW = "FFFFFF00";
export const RED = "FFFF0000";
export const BLUE = "FF0000FF";
export const GRAY = "FF999999";
export const GREEN = "FF00FF00";
export const PURPLE = "FF9900FF";
export const LIGHT_GRAY = "FFEFEFEF";
export const WHITE = "FFFFFFFF";

let counter = 0;

/** Kehtiv müügis Lenovo ThinkPad T14 Gen 3 rida (unikaalse Tech ID ja seerianumbriga) */
export function techRow(overrides: TechFixtureRow = {}): TechFixtureRow {
  counter++;
  return {
    brand: "Lenovo",
    model: "ThinkPad T14 Gen 3",
    id: String(1_000_000 + counter),
    serial: `TESTSN${String(counter).padStart(5, "0")}`,
    cpu: "i5-1235U",
    ram: "16384",
    storage: "256 SSD",
    display: 'W14"',
    resolution: "1920x1200 IPS",
    k: null,
    l: null,
    price: "380",
    gpu: "Intel Iris Xe",
    ...overrides,
  };
}

const toFill = (fill: string | CellFill | undefined): CellFill => (fill === undefined ? { kind: "none" } : typeof fill === "string" ? { kind: "rgb", argb: fill, pattern: "solid" } : fill);
const cell = (text: string | null | undefined, fill?: string | CellFill): SheetCell => ({ text: text ?? null, fill: toFill(fill) });

const HEADER = ["", "Brand", "", "", "Serial Nr.", "Processor", "RAM(MB)", "HDD(GB)", "Display", "Resolution", "", "", "Price", "Video"];

export type TechFixtureEntry = TechFixtureRow | { heading: string };

/** Tab: päis (rida 1, kollane taust nagu päris tabelis) + read; { heading } = ühendatud kategooria pealkiri B:K */
export function techSheet(name: string, entries: TechFixtureEntry[], options: { header?: string[]; noFills?: boolean } = {}): SheetData {
  const header = options.header ?? HEADER;
  const rows: SheetRow[] = [{ rowNumber: 1, cells: header.map((text) => cell(text || null, options.noFills ? undefined : YELLOW)) }];
  const merges: string[] = [];
  entries.forEach((entry, index) => {
    const rowNumber = index + 2;
    if ("heading" in entry) {
      merges.push(`B${rowNumber}:K${rowNumber}`);
      rows.push({ rowNumber, cells: [cell(null), ...Array.from({ length: 10 }, () => cell(entry.heading))] });
      return;
    }
    const f = options.noFills ? undefined : entry.rowFill;
    // noFills: XLSX ilma stiiliinfota (nagu CSV) — ükski lahter pole värvitud
    const pick = (fill: string | CellFill | undefined) => (options.noFills ? undefined : (fill ?? f));
    rows.push({
      rowNumber,
      cells: [
        cell(null, options.noFills ? undefined : YELLOW),
        cell(entry.brand, pick(entry.brandFill)),
        cell(entry.model, pick(entry.modelFill)),
        cell(entry.id, f),
        cell(entry.serial, f),
        cell(entry.cpu, f),
        cell(entry.ram, f),
        cell(entry.storage, f),
        cell(entry.display, f),
        cell(entry.resolution, f),
        cell(entry.k, f),
        cell(entry.l, f),
        cell(entry.price, entry.priceFill ?? (options.noFills ? undefined : (f ?? YELLOW))),
        cell(entry.gpu, f),
      ],
    });
  });
  const filledCells = rows.reduce((n, row) => n + row.cells.filter((c) => c.fill.kind !== "none").length, 0);
  return { name, rows, merges, filledCells };
}

/** Tüüpiline töövihik: "Used Laptops " (lõputühikuga) + mittevajalikud tabid */
export function techWorkbook(rows: TechFixtureEntry[], extra: SheetData[] = []): SheetData[] {
  return [
    techSheet("Used Laptops ", rows),
    techSheet("Monitors", [{ brand: "Dell", model: "P2419H", id: "5000001", serial: "MONSN0001", price: "60" }]),
    techSheet("Desktops", [{ brand: "Dell", model: "OptiPlex 7010 Tower", id: "5000002", serial: "DESKSN0001", cpu: "i5-3570", ram: "4096", storage: "500", price: "70" }]),
    ...extra,
  ];
}

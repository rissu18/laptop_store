import { createHash } from "node:crypto";
import { stableStringify } from "@/integrations/supplier/stable-stringify";
import { normalizeTechRow, type TechConfig, type TechUnit, type TechUnitStatus } from "./tech-normalizer";
import type { TechParseResult } from "./tech-parser";

/**
 * Tech snapshot: read → füüsilised seadmed (dedup Tech ID järgi) → müüdavad konfiguratsioonid (grupid).
 *
 *  - Sama Tech ID (D) mitmes tabis identsete andmetega = üks seade. Erinevate andmetega → KONFLIKT,
 *    seade jääb müügist välja (ei valita suvaliselt).
 *  - Sama konfiguratsiooni + sama hinnakirja hinnaga müügis seadmed = üks SupplierListing, laoseis = seadmete arv.
 *  - Pakkumise identiteet = räsi konfiguratsioonist + hinnast (mitte reanumber, tab ega seerianumber).
 */

export class TechSnapshotError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "TechSnapshotError";
  }
}

export interface TechPhysicalUnit {
  externalUnitId: string;
  serial: string | null;
  status: TechUnitStatus;
  reasons: string[];
  soldByColor: boolean;
  config: TechConfig | null;
  /** Grupi (SupplierListingu) väline ID, kui seade on müüdav või konfiguratsioon on kehtiv */
  groupId: string | null;
  occurrences: { sheet: string; rowNumber: number }[];
  /** Esimese esinemise toorandmed (admin: diagnostika) */
  primary: TechUnit;
}

export interface TechGroup {
  externalId: string;
  sku: string;
  config: TechConfig;
  /** Müügis seadmete Tech ID-d (sorteeritud) */
  unitIds: string[];
}

export interface TechSnapshotCounts {
  sourceRows: number;
  laptopRows: number;
  soldRows: number;
  notLaptopRows: number;
  invalidRows: number;
  defectRows: number;
  unknownNoteRows: number;
  availableRows: number;
  missingIdRows: number;
  missingSerialRows: number;
  invalidPriceRows: number;
  unknownBrandRows: number;
  /** Kandidaatread (värvimata sülearvutid) ja neist kehtiva hinna / ID / seerianumbriga */
  candidateRows: number;
  candidateValidPrice: number;
  candidateValidId: number;
  candidateValidSerial: number;
  physicalUnits: number;
  duplicateRowsMerged: number;
  conflicts: number;
  serialDuplicates: number;
  validUnits: number;
  groups: number;
}

export interface TechSnapshot {
  parse: TechParseResult;
  rows: TechUnit[];
  units: TechPhysicalUnit[];
  groups: TechGroup[];
  counts: TechSnapshotCounts;
  conflictSample: { externalUnitId: string; occurrences: string[] }[];
}

/** Konfiguratsiooni võti: kõik, mis teeb müüdava pakkumise erinevaks (seisukord on kõigil B; seerianumber/ID ei kuulu). */
export function techConfigKey(config: TechConfig) {
  return {
    brand: config.model.brand,
    model: config.model.slug,
    cpu: config.cpu.toLowerCase(),
    ramGb: config.ramGb,
    storageGb: config.storageGb,
    storageType: config.storageType,
    screenSizeIn: config.screenSizeIn,
    resolution: config.resolution,
    panel: config.panel,
    touchscreen: config.touchscreen,
    gpu: config.gpu?.toLowerCase() ?? null,
    backlit: config.features.backlit,
    smartcard: config.features.smartcard,
    lte: config.features.lte,
    fiveG: config.features.fiveG,
    sourcePriceCents: config.sourcePriceCents,
  };
}

/** Deterministlik pakkumise ID (sama konfiguratsioon + hind → sama ID igas sync'is) */
export function techListingExternalId(config: TechConfig): string {
  return createHash("sha256").update(stableStringify(techConfigKey(config))).digest("hex").slice(0, 20);
}

export function techListingSku(externalId: string): string {
  return `TC-${externalId.slice(0, 10).toUpperCase()}`;
}

/** Seadme andmed duplikaadi võrdlemiseks (kõik lähteveerud peale värvi) */
function identityOf(unit: TechUnit): string {
  const s = unit.source;
  const norm = (v: string | null) => v?.toLowerCase().replace(/\s+/g, " ").trim() ?? null;
  return stableStringify([s.brand, s.model, s.serial, s.processor, s.ram, s.storage, s.display, s.resolution, s.noteK, s.noteL, s.price, s.video].map(norm));
}

const STATUS_SEVERITY: TechUnitStatus[] = ["AVAILABLE", "UNKNOWN_NOTE", "DEFECT", "INVALID", "NOT_LAPTOP", "SOLD", "CONFLICT"];
const worst = (a: TechUnitStatus, b: TechUnitStatus) => (STATUS_SEVERITY.indexOf(a) >= STATUS_SEVERITY.indexOf(b) ? a : b);

export function buildTechSnapshot(parse: TechParseResult): TechSnapshot {
  const rows = parse.rows.map(normalizeTechRow);
  const counts: TechSnapshotCounts = {
    sourceRows: parse.sheets.reduce((n, s) => n + s.laptopRows, 0),
    laptopRows: 0,
    soldRows: 0,
    notLaptopRows: 0,
    invalidRows: 0,
    defectRows: 0,
    unknownNoteRows: 0,
    availableRows: 0,
    missingIdRows: 0,
    missingSerialRows: 0,
    invalidPriceRows: 0,
    unknownBrandRows: 0,
    candidateRows: 0,
    candidateValidPrice: 0,
    candidateValidId: 0,
    candidateValidSerial: 0,
    physicalUnits: 0,
    duplicateRowsMerged: 0,
    conflicts: 0,
    serialDuplicates: 0,
    validUnits: 0,
    groups: 0,
  };

  for (const row of rows) {
    counts.laptopRows++;
    if (row.status === "SOLD") counts.soldRows++;
    if (row.status === "NOT_LAPTOP") counts.notLaptopRows++;
    if (row.status === "INVALID") counts.invalidRows++;
    if (row.status === "DEFECT") counts.defectRows++;
    if (row.status === "UNKNOWN_NOTE") counts.unknownNoteRows++;
    if (row.status === "AVAILABLE") counts.availableRows++;
    if (row.status !== "SOLD" && row.status !== "NOT_LAPTOP") {
      counts.candidateRows++;
      if (!row.issues.includes("INVALID_PRICE")) counts.candidateValidPrice++;
      if (!row.issues.includes("MISSING_ID")) counts.candidateValidId++;
      if (!row.issues.includes("MISSING_SERIAL")) counts.candidateValidSerial++;
      if (row.issues.includes("MISSING_ID")) counts.missingIdRows++;
      if (row.issues.includes("MISSING_SERIAL")) counts.missingSerialRows++;
      if (row.issues.includes("INVALID_PRICE")) counts.invalidPriceRows++;
      if (row.issues.includes("UNKNOWN_BRAND")) counts.unknownBrandRows++;
    }
  }

  // Füüsilised seadmed Tech ID järgi
  const byId = new Map<string, { rows: TechUnit[] }>();
  for (const row of rows) {
    if (!row.externalUnitId) continue;
    const entry = byId.get(row.externalUnitId) ?? { rows: [] };
    entry.rows.push(row);
    byId.set(row.externalUnitId, entry);
  }

  const units: TechPhysicalUnit[] = [];
  const conflictSample: TechSnapshot["conflictSample"] = [];
  for (const [externalUnitId, { rows: occurrences }] of [...byId].sort(([a], [b]) => a.localeCompare(b))) {
    const primary = occurrences[0];
    const identity = identityOf(primary);
    const conflict = occurrences.some((o) => identityOf(o) !== identity);
    let status: TechUnitStatus = primary.status;
    const reasons = [...primary.reasons];
    for (const other of occurrences.slice(1)) status = worst(status, other.status);
    if (conflict) {
      status = "CONFLICT";
      reasons.push(`Sama Tech ID erinevate andmetega: ${occurrences.map((o) => `${o.sheet.trim()}!${o.rowNumber}`).join(", ")}`);
      counts.conflicts++;
      conflictSample.push({ externalUnitId, occurrences: occurrences.map((o) => `${o.sheet.trim()}!${o.rowNumber}`) });
    } else if (occurrences.length > 1) {
      counts.duplicateRowsMerged += occurrences.length - 1;
      if (status !== primary.status) reasons.push(...occurrences.flatMap((o) => o.reasons).filter((r) => !reasons.includes(r)));
    }
    units.push({
      externalUnitId,
      serial: primary.serial,
      status,
      reasons,
      soldByColor: occurrences.some((o) => o.soldByColor),
      config: conflict ? null : primary.config,
      groupId: !conflict && primary.config ? techListingExternalId(primary.config) : null,
      occurrences: occurrences.map((o) => ({ sheet: o.sheet, rowNumber: o.rowNumber })),
      primary,
    });
  }
  counts.physicalUnits = units.length;

  const serials = new Map<string, number>();
  for (const unit of units) if (unit.serial) serials.set(unit.serial.toLowerCase(), (serials.get(unit.serial.toLowerCase()) ?? 0) + 1);
  counts.serialDuplicates = [...serials.values()].filter((n) => n > 1).length;

  // Müüdavad konfiguratsioonid
  const groupsById = new Map<string, TechGroup>();
  for (const unit of units) {
    if (unit.status !== "AVAILABLE" || !unit.config || !unit.groupId) continue;
    counts.validUnits++;
    const group = groupsById.get(unit.groupId) ?? { externalId: unit.groupId, sku: techListingSku(unit.groupId), config: unit.config, unitIds: [] };
    group.unitIds.push(unit.externalUnitId);
    groupsById.set(unit.groupId, group);
  }
  const groups = [...groupsById.values()].sort((a, b) => a.externalId.localeCompare(b.externalId));
  for (const group of groups) group.unitIds.sort();
  counts.groups = groups.length;

  return { parse, rows, units, groups, counts, conflictSample };
}

export interface TechTrustInput {
  /** Eelmises seisus müügis olnud seadmete Tech ID-d */
  previouslyAvailableUnitIds: string[];
  /** Eelmise eduka sync'i värvitud (müüdud) ridade arv; null = varasemat pole */
  previousSoldRows: number | null;
}

export interface TechTrustDecision {
  /** true → hinnakirjast puuduvad seadmed märgitakse mitte saadavaks */
  trusted: boolean;
  reason: string | null;
  /** Andmebaasis müügis olnud, aga snapshot'ist täiesti puuduvad seadmed */
  missingIds: string[];
  /** Eelmise seisuga võrreldes müügist kaduvad seadmed (müüdud, defekt, puuduv …) */
  droppedFromAvailable: number;
}

const MIN_SHARE = 0.7;

/**
 * Snapshot'i kontroll ENNE andmebaasi kirjutamist. Fataalne probleem → TechSnapshotError (kataloog jääb samaks).
 * Mitte-fataalne kahtlus → trusted=false: vastuses olevaid seadmeid uuendatakse, aga puuduvaid maha ei võeta.
 */
export function decideTechSnapshotTrust(snapshot: TechSnapshot, input: TechTrustInput, options: { allowLargeDrop?: boolean } = {}): TechTrustDecision {
  const { parse, counts } = snapshot;
  if (parse.laptopSources === 0) throw new TechSnapshotError("NO_LAPTOP_SECTIONS", `Sülearvutite tabe/sektsioone ei leitud. ${parse.layoutErrors.join(" ")}`.trim());
  if (parse.filledCellsInLaptopSheets === 0) {
    throw new TechSnapshotError("NO_STYLE_INFO", "XLSX-is pole lahtrite taustavärve — müüdud seadmeid ei saa tuvastada");
  }
  if (counts.laptopRows === 0) throw new TechSnapshotError("NO_ROWS", "Sülearvutite ridu ei leitud");
  if (input.previousSoldRows !== null && input.previousSoldRows >= 10 && counts.soldRows === 0) {
    throw new TechSnapshotError("COLOR_DROP", `Eelmises snapshot'is oli ${input.previousSoldRows} värvitud (müüdud) rida, nüüd 0 — stiiliinfo kahtlane`);
  }
  if (counts.candidateRows >= 10) {
    const share = (n: number) => n / counts.candidateRows;
    if (share(counts.candidateValidPrice) < MIN_SHARE) throw new TechSnapshotError("PRICE_PARSE", `Hinda (M) ei õnnestunud lugeda ${counts.candidateRows - counts.candidateValidPrice} / ${counts.candidateRows} real`);
    if (share(counts.candidateValidId) < MIN_SHARE) throw new TechSnapshotError("ID_PARSE", `Tech ID (D) puudub ${counts.candidateRows - counts.candidateValidId} / ${counts.candidateRows} real`);
    if (share(counts.candidateValidSerial) < MIN_SHARE) throw new TechSnapshotError("SERIAL_PARSE", `Seerianumber (E) puudub ${counts.candidateRows - counts.candidateValidSerial} / ${counts.candidateRows} real`);
  }
  if (counts.conflicts > Math.max(5, Math.ceil(counts.physicalUnits * 0.1))) {
    throw new TechSnapshotError("CONFLICTS", `Liiga palju vastuolulisi Tech ID-sid (${counts.conflicts})`);
  }

  const status = new Map(snapshot.units.map((u) => [u.externalUnitId, u.status]));
  const previouslyAvailable = input.previouslyAvailableUnitIds;
  const droppedFromAvailable = previouslyAvailable.filter((id) => status.get(id) !== "AVAILABLE").length;
  const largeDropLimit = Math.max(20, Math.ceil(previouslyAvailable.length * 0.5));
  if (!options.allowLargeDrop && previouslyAvailable.length >= 20 && droppedFromAvailable > largeDropLimit) {
    throw new TechSnapshotError(
      "LARGE_DROP",
      `Müügist kaoks korraga ${droppedFromAvailable} / ${previouslyAvailable.length} seadet (piir ${largeDropLimit}) — kahtlane muutus. Kontrolli hinnakirja; teadliku muutuse korral luba suur muutus.`,
    );
  }

  const missingIds = previouslyAvailable.filter((id) => !status.has(id));
  if (parse.layoutErrors.length) {
    return { trusted: false, reason: `Osa tabe jäi lugemata: ${parse.layoutErrors.join(" ")}`, missingIds, droppedFromAvailable };
  }
  const missingLimit = Math.max(10, Math.ceil(previouslyAvailable.length * 0.25));
  if (!options.allowLargeDrop && missingIds.length > missingLimit) {
    return { trusted: false, reason: `Hinnakirjast puudub ${missingIds.length} varem müügis olnud seadet (piir ${missingLimit}) — puuduvaid maha ei võetud`, missingIds, droppedFromAvailable };
  }
  return { trusted: true, reason: null, missingIds, droppedFromAvailable };
}

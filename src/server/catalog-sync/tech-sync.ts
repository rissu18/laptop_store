import { randomUUID } from "node:crypto";
import { and, desc, eq, inArray } from "drizzle-orm";
import { BRAND_NAMES } from "@/domain/catalog/types";
import { stableStringify } from "@/integrations/supplier/stable-stringify";
import {
  TECH_DELIVERY_DAYS,
  TECH_GRADE,
  TECH_NORMALIZER_VERSION,
  TECH_SOURCE,
  TECH_SUPPLIER_CODE,
  TECH_VAT_SCHEME,
  techPurchasePriceCents,
  techSalePriceCents,
} from "@/integrations/tech/tech-normalizer";
import { parseTechWorkbook } from "@/integrations/tech/tech-parser";
import type { SheetData } from "@/integrations/tech/tech-sheet";
import { TechSnapshotError, buildTechSnapshot, decideTechSnapshotTrust, techConfigKey, type TechGroup, type TechPhysicalUnit, type TechSnapshot } from "@/integrations/tech/tech-snapshot";
import type { Database } from "@/server/db/client";
import { catalogSyncRuns, icecatMetadata, listingImages, productImages, productModels, supplierInventoryUnits, supplierListings } from "@/server/db/schema";
import type { LogLevel } from "@/server/logging/system-log";
import { modeOf } from "./laptopid-sync";
import { syncLogLevel } from "@/domain/catalog/sync-log-level";
import { acquireSyncRun, finishSyncRun, lastSuccessfulSyncRun, type SyncTrigger } from "./sync-runs";

/**
 * Tech hinnakiri (Google Sheets XLSX) → PostgreSQL (vt docs/TECH_SYNC.md).
 *
 *   1. lukk (catalog_sync_runs, allikas TECH)    5. mudelid: täpne slug-vaste olemasolevaga, muidu uus (olemasolevaid EI muudeta)
 *   2. XLSX → tabid/sektsioonid → read           6. seadmed (supplier_inventory_units): staatus, seos pakkumisega
 *   3. normaliseerimine, dedup Tech ID järgi      7. pakkumised: laoseis = müügis seadmete arv; 0 → available=false (ei kustutata)
 *   4. snapshot'i kontroll (fataalne → stopp)      8. logi + luku vabastamine
 *
 * Võrgutöö (XLSX) tehakse ENNE tehingut; kõik kirjutamised on ühes tehingus. Viga → eelmine seis jääb.
 * Sync kirjutab ainult tarnija veerge — manual_overrides, status, featured, description jäävad puutumata.
 * Idempotentne: sama XLSX kaks korda → teisel korral ainult lastSeenAt muutub.
 */

type ModelRow = typeof productModels.$inferSelect;
type ListingRow = typeof supplierListings.$inferSelect;
type UnitRow = typeof supplierInventoryUnits.$inferSelect;

export interface TechSyncOptions {
  trigger: SyncTrigger;
  triggeredBy?: string | null;
  /** Admin kinnitas teadlikult suure muutuse (palju seadmeid kadus/müüdi korraga) */
  allowLargeDrop?: boolean;
  /** XLSX → tabid (päris: allalaadimine + ExcelJS; testid: valmis SheetData) */
  loadSheets: () => Promise<SheetData[]>;
  log: (entry: { level: LogLevel; message: string; details?: Record<string, unknown> }) => Promise<void>;
  now?: () => Date;
  leaseMs?: number;
}

export type TechEnrichment = "EXISTING" | "ICECAT" | "MISSING";

export interface TechSyncStats {
  sourceRows: number;
  laptopRows: number;
  soldRows: number;
  notLaptopRows: number;
  defectRows: number;
  unknownNoteRows: number;
  invalidRows: number;
  missingIdRows: number;
  missingSerialRows: number;
  invalidPriceRows: number;
  physicalUnits: number;
  validUnits: number;
  duplicateRowsMerged: number;
  conflicts: number;
  serialDuplicates: number;
  groups: number;
  created: number;
  updated: number;
  unchanged: number;
  madeUnavailable: number;
  unitsCreated: number;
  unitsUpdated: number;
  unitsUnchanged: number;
  unitsMadeUnavailable: number;
  unitsReactivated: number;
  unitsMissing: number;
  /** Puudusid hinnakirjast, aga jäeti müüki, sest snapshot polnud usaldusväärne */
  missingNotDeactivated: number;
  modelsReused: number;
  modelsCreated: number;
  enrichmentExisting: number;
  enrichmentIcecat: number;
  enrichmentMissing: number;
  taxonomyWarnings: number;
  durationMs: number;
}

export interface TechModelReport {
  slug: string;
  title: string;
  reused: boolean;
  enrichment: TechEnrichment;
  listings: number;
  units: number;
}

export interface TechSyncPlan {
  snapshot: TechSnapshot;
  trusted: boolean;
  trustReason: string | null;
  stats: TechSyncStats;
  models: TechModelReport[];
  changed: boolean;
  write: (db: Database) => Promise<void>;
}

export type TechSyncResult =
  | { status: "BUSY" }
  | { status: "SUCCESS"; runId: string; stats: TechSyncStats; snapshotTrusted: boolean; trustReason: string | null; changed: boolean; models: TechModelReport[] }
  | { status: "FAILED"; runId: string; error: string; stats: Partial<TechSyncStats> };

/** Tarnija veerud, mida sync kirjutab. Admini väljad (status, manual_overrides, featured …) siin EI OLE. */
export function techListingColumns(group: TechGroup, stock: number, now: Date) {
  const c = group.config;
  return {
    supplierSku: null,
    cpu: c.cpu,
    cpuFamily: c.cpuFamily,
    cpuGeneration: c.cpuGeneration,
    ramGb: c.ramGb,
    ramType: null,
    storageGb: c.storageGb,
    gpu: c.gpu,
    gpuDedicated: c.gpuDedicated,
    screenSizeIn: c.screenSizeIn,
    resolution: c.resolution,
    resolutionLabel: c.resolutionLabel,
    panel: c.panel,
    touchscreen: c.touchscreen,
    keyboard: null,
    // Techi hinnakirjas seisukorda pole → alati B (admin võib parandada)
    grade: TECH_GRADE,
    features: {
      touch: c.touchscreen,
      backlit: c.features.backlit,
      smartcard: c.features.smartcard,
      lte: c.features.lte,
      "5g": c.features.fiveG,
      "dedicated-gpu": c.gpuDedicated,
      "nvidia-rtx": c.gpu ? c.gpuDedicated === true && /RTX/i.test(c.gpu) : null,
    },
    operatingSystem: null,
    // Tech garantiid ei anna → ei leiutata
    warrantyMonths: null,
    batteryHealthPct: null,
    // Kõik Techist müüdavad sülearvutid on laadijaga (kasutaja kinnitus)
    chargerIncluded: true,
    // Täpne laoseis = müügis füüsiliste seadmete arv
    stock,
    available: stock > 0,
    deliveryMinDays: TECH_DELIVERY_DAYS.min,
    deliveryMaxDays: TECH_DELIVERY_DAYS.max,
    // Ostuhind = hinnakirja hind − 20 €; müügihind = hinnakirja hind + 60 €
    supplierPriceCents: techPurchasePriceCents(c.sourcePriceCents),
    vatScheme: TECH_VAT_SCHEME,
    salePriceCents: techSalePriceCents(c.sourcePriceCents),
    priceSource: "SUPPLIER" as const,
    weightKg: null,
    conditionNotes: null,
    details: { source: TECH_SOURCE, sourcePriceCents: c.sourcePriceCents, storageType: c.storageType },
    rawData: { normalizerVersion: TECH_NORMALIZER_VERSION, configKey: techConfigKey(c) },
    lastSyncedAt: now,
    lastSeenAt: now,
  };
}

type ListingColumns = ReturnType<typeof techListingColumns>;
/** Kas olemasoleva rea tarnija veerud võrduvad soovitud väärtustega (ajatemplid ei loe) */
function sameListing(existing: ListingRow, columns: ListingColumns): boolean {
  const keys = (Object.keys(columns) as (keyof ListingColumns)[]).filter((k) => k !== "lastSyncedAt" && k !== "lastSeenAt");
  const pick = (row: Record<string, unknown>) => Object.fromEntries(keys.map((k) => [k, row[k] ?? null]));
  return stableStringify(pick(existing as unknown as Record<string, unknown>)) === stableStringify(pick(columns as unknown as Record<string, unknown>));
}

/** Seadme toorandmed adminile (seerianumber on eraldi veerus — siia seda ei korrata) */
function unitRawData(unit: TechPhysicalUnit) {
  const s = unit.primary.source;
  return {
    normalizerVersion: TECH_NORMALIZER_VERSION,
    occurrences: unit.occurrences.map((o) => `${o.sheet.trim()}!${o.rowNumber}`),
    brand: s.brand,
    model: s.model,
    processor: s.processor,
    ram: s.ram,
    storage: s.storage,
    display: s.display,
    resolution: s.resolution,
    noteK: s.noteK,
    noteL: s.noteL,
    price: s.price,
    video: s.video,
    brandFill: s.brandFill,
    modelFill: s.modelFill,
    notes: { defects: unit.primary.notes.defects, unknown: unit.primary.notes.unknown, ignored: unit.primary.notes.ignored, percentages: unit.primary.notes.percentages, charger: unit.primary.notes.charger },
  };
}

function emptyStats(): TechSyncStats {
  return {
    sourceRows: 0, laptopRows: 0, soldRows: 0, notLaptopRows: 0, defectRows: 0, unknownNoteRows: 0, invalidRows: 0, missingIdRows: 0, missingSerialRows: 0,
    invalidPriceRows: 0, physicalUnits: 0, validUnits: 0, duplicateRowsMerged: 0, conflicts: 0, serialDuplicates: 0, groups: 0, created: 0, updated: 0,
    unchanged: 0, madeUnavailable: 0, unitsCreated: 0, unitsUpdated: 0, unitsUnchanged: 0, unitsMadeUnavailable: 0, unitsReactivated: 0, unitsMissing: 0,
    missingNotDeactivated: 0, modelsReused: 0, modelsCreated: 0, enrichmentExisting: 0, enrichmentIcecat: 0, enrichmentMissing: 0, taxonomyWarnings: 0, durationMs: 0,
  };
}

/** Eelmise eduka Tech sync'i müüdud ridade arv (värviinfo järsu kadumise tuvastamiseks) */
async function previousSoldRows(db: Pick<Database, "select">): Promise<number | null> {
  const [row] = await db
    .select({ stats: catalogSyncRuns.stats })
    .from(catalogSyncRuns)
    .where(and(eq(catalogSyncRuns.source, TECH_SOURCE), eq(catalogSyncRuns.status, "SUCCESS")))
    .orderBy(desc(catalogSyncRuns.startedAt))
    .limit(1);
  const value = row?.stats.soldRows;
  return typeof value === "number" ? value : null;
}

/**
 * Snapshot → kirjutamise plaan (loeb andmebaasi, EI kirjuta). Kasutab nii päris sync kui ka kuivkäivitus (dry-run).
 * Fataalne snapshot'i probleem → TechSnapshotError.
 */
export async function planTechSync(
  db: Database,
  snapshot: TechSnapshot,
  options: { now: Date; allowLargeDrop?: boolean; /** Kuivkäivitus enne migratsiooni: seadmete tabelit veel pole */ unitsTableMissing?: boolean },
): Promise<TechSyncPlan> {
  const { now } = options;
  const stats = emptyStats();
  Object.assign(stats, {
    sourceRows: snapshot.counts.sourceRows,
    laptopRows: snapshot.counts.laptopRows,
    soldRows: snapshot.counts.soldRows,
    notLaptopRows: snapshot.counts.notLaptopRows,
    defectRows: snapshot.counts.defectRows,
    unknownNoteRows: snapshot.counts.unknownNoteRows,
    invalidRows: snapshot.counts.invalidRows,
    missingIdRows: snapshot.counts.missingIdRows,
    missingSerialRows: snapshot.counts.missingSerialRows,
    invalidPriceRows: snapshot.counts.invalidPriceRows,
    physicalUnits: snapshot.counts.physicalUnits,
    validUnits: snapshot.counts.validUnits,
    duplicateRowsMerged: snapshot.counts.duplicateRowsMerged,
    conflicts: snapshot.counts.conflicts,
    serialDuplicates: snapshot.counts.serialDuplicates,
    groups: snapshot.counts.groups,
  });

  const [existingListings, existingUnits, soldBefore] = await Promise.all([
    db.select().from(supplierListings).where(eq(supplierListings.supplier, TECH_SUPPLIER_CODE)),
    options.unitsTableMissing ? Promise.resolve([] as UnitRow[]) : db.select().from(supplierInventoryUnits).where(eq(supplierInventoryUnits.supplier, TECH_SUPPLIER_CODE)),
    previousSoldRows(db),
  ]);
  const trust = decideTechSnapshotTrust(
    snapshot,
    { previouslyAvailableUnitIds: existingUnits.filter((u) => u.available).map((u) => u.externalUnitId), previousSoldRows: soldBefore },
    { allowLargeDrop: options.allowLargeDrop },
  );

  // Mudelid: täpne kanooniline slug. Olemasolevat mudelit EI muudeta (Laptopid/Icecat/admin andmed jäävad).
  const groupsBySlug = new Map<string, TechGroup[]>();
  for (const group of snapshot.groups) groupsBySlug.set(group.config.model.slug, [...(groupsBySlug.get(group.config.model.slug) ?? []), group]);
  const slugs = [...groupsBySlug.keys()];
  const existingModels: ModelRow[] = slugs.length ? await db.select().from(productModels).where(inArray(productModels.slug, slugs)) : [];
  const modelBySlug = new Map(existingModels.map((m) => [m.slug, m]));
  const modelInserts: (typeof productModels.$inferInsert)[] = [];
  const modelIdBySlug = new Map<string, string>();
  for (const [slug, groups] of groupsBySlug) {
    const existing = modelBySlug.get(slug);
    if (existing) {
      modelIdBySlug.set(slug, existing.id);
      continue;
    }
    const ref = groups[0].config.model;
    const id = randomUUID();
    modelIdBySlug.set(slug, id);
    modelInserts.push({
      id,
      slug,
      manufacturer: ref.brand,
      family: ref.series,
      model: ref.model,
      generation: ref.generation,
      screenSizeIn: modeOf(groups.map((g) => g.config.screenSizeIn)),
      // Kaal, pordid, Wi-Fi, Bluetooth: Tech ei anna → NULL (ei leiutata)
      weightKg: null,
      usbAPorts: null,
      usbCPorts: null,
      wifi: null,
      bluetooth: null,
      status: "ACTIVE",
      featured: false,
    });
  }
  stats.modelsReused = existingModels.length;
  stats.modelsCreated = modelInserts.length;
  stats.taxonomyWarnings = [...groupsBySlug.values()].filter((g) => g[0].config.model.taxonomyWarning).length;

  // Rikastus (ainult raport): olemasoleva mudeli pildid/andmed, Icecat või puudub
  const reusedIds = existingModels.map((m) => m.id);
  const [modelImageRows, icecatRows, siblingImageRows] = reusedIds.length
    ? await Promise.all([
        db.select({ modelId: productImages.productModelId }).from(productImages).where(and(inArray(productImages.productModelId, reusedIds), eq(productImages.isHidden, false))),
        db.select({ modelId: icecatMetadata.productModelId }).from(icecatMetadata).where(and(inArray(icecatMetadata.productModelId, reusedIds), eq(icecatMetadata.status, "MATCHED"))),
        db
          .select({ modelId: supplierListings.productModelId })
          .from(listingImages)
          .innerJoin(supplierListings, eq(listingImages.supplierListingId, supplierListings.id))
          .where(and(inArray(supplierListings.productModelId, reusedIds), eq(listingImages.isHidden, false))),
      ])
    : [[], [], []];
  const withModelImages = new Set(modelImageRows.map((r) => r.modelId));
  const withIcecat = new Set(icecatRows.map((r) => r.modelId));
  const withSiblingImages = new Set(siblingImageRows.map((r) => r.modelId));
  const models: TechModelReport[] = [...groupsBySlug].map(([slug, groups]) => {
    const existing = modelBySlug.get(slug);
    const enrichment: TechEnrichment = !existing
      ? "MISSING"
      : withIcecat.has(existing.id)
        ? "ICECAT"
        : withModelImages.has(existing.id) || withSiblingImages.has(existing.id)
          ? "EXISTING"
          : "MISSING";
    const ref = groups[0].config.model;
    return { slug, title: existing ? `${BRAND_NAMES[ref.brand]} ${existing.family} ${existing.model}`.replace(/\s+/g, " ") : ref.title, reused: Boolean(existing), enrichment, listings: groups.length, units: groups.reduce((n, g) => n + g.unitIds.length, 0) };
  });
  stats.enrichmentExisting = models.filter((m) => m.enrichment === "EXISTING").length;
  stats.enrichmentIcecat = models.filter((m) => m.enrichment === "ICECAT").length;
  stats.enrichmentMissing = models.filter((m) => m.enrichment === "MISSING").length;

  // Pakkumiste ID-d (olemasolev või uus) — enne seadmeid, et seadmed saaks seose
  const listingByExternalId = new Map(existingListings.map((l) => [l.supplierProductId, l]));
  const listingIdByGroup = new Map<string, string>();
  for (const group of snapshot.groups) listingIdByGroup.set(group.externalId, listingByExternalId.get(group.externalId)?.id ?? randomUUID());
  const listingIdForGroupId = (groupId: string | null) => (groupId ? (listingIdByGroup.get(groupId) ?? listingByExternalId.get(groupId)?.id ?? null) : null);

  // Seadmed: soovitud lõppseis
  const unitByExternalId = new Map(existingUnits.map((u) => [u.externalUnitId, u]));
  const unitInserts: (typeof supplierInventoryUnits.$inferInsert)[] = [];
  const unitUpdates: { id: string; set: Partial<UnitRow> }[] = [];
  const unitTouches: string[] = [];
  /** Lõppseisus müügis seadmete arv pakkumise kaupa */
  const stockByListing = new Map<string, number>();
  const seen = new Set<string>();
  for (const unit of snapshot.units) {
    seen.add(unit.externalUnitId);
    const existing = unitByExternalId.get(unit.externalUnitId);
    const available = unit.status === "AVAILABLE";
    const listingId = listingIdForGroupId(unit.groupId) ?? existing?.supplierListingId ?? null;
    if (available && listingId) stockByListing.set(listingId, (stockByListing.get(listingId) ?? 0) + 1);
    const desired = {
      serialNumber: unit.serial,
      supplierListingId: listingId,
      available,
      status: unit.status,
      soldByColor: unit.soldByColor,
      excludedReason: available ? null : unit.reasons.join("; ") || null,
      sourceSheet: unit.occurrences[0].sheet,
      sourceRow: unit.occurrences[0].rowNumber,
      rawData: unitRawData(unit),
    };
    if (!existing) {
      unitInserts.push({ id: randomUUID(), supplier: TECH_SUPPLIER_CODE, externalUnitId: unit.externalUnitId, firstSeenAt: now, lastSeenAt: now, ...desired });
      stats.unitsCreated++;
      continue;
    }
    const current = Object.fromEntries(Object.keys(desired).map((k) => [k, existing[k as keyof UnitRow] ?? null]));
    if (stableStringify(current) === stableStringify(desired)) {
      unitTouches.push(existing.id);
      stats.unitsUnchanged++;
    } else {
      unitUpdates.push({ id: existing.id, set: { ...desired, lastSeenAt: now } });
      stats.unitsUpdated++;
      if (existing.available && !available) stats.unitsMadeUnavailable++;
      if (!existing.available && available) stats.unitsReactivated++;
    }
  }
  // Hinnakirjast täiesti puuduvad seadmed
  for (const existing of existingUnits) {
    if (seen.has(existing.externalUnitId) || !existing.available) continue;
    if (trust.trusted) {
      unitUpdates.push({ id: existing.id, set: { available: false, status: "MISSING", excludedReason: "Puudub hinnakirjast (usaldusväärne täielik snapshot)" } });
      stats.unitsMissing++;
      stats.unitsMadeUnavailable++;
    } else {
      // Snapshot pole usaldusväärne → jääb müüki ja pakkumise laoseisu
      stats.missingNotDeactivated++;
      if (existing.supplierListingId) stockByListing.set(existing.supplierListingId, (stockByListing.get(existing.supplierListingId) ?? 0) + 1);
    }
  }

  // Pakkumised
  const listingInserts: (typeof supplierListings.$inferInsert)[] = [];
  const listingUpdates: { id: string; set: Partial<ListingRow> }[] = [];
  const listingTouches: string[] = [];
  const groupListingIds = new Set<string>();
  for (const group of snapshot.groups) {
    const id = listingIdByGroup.get(group.externalId)!;
    groupListingIds.add(id);
    const columns = techListingColumns(group, stockByListing.get(id) ?? 0, now);
    const existing = listingByExternalId.get(group.externalId);
    if (!existing) {
      listingInserts.push({ id, productModelId: modelIdBySlug.get(group.config.model.slug)!, supplier: TECH_SUPPLIER_CODE, supplierProductId: group.externalId, sku: group.sku, firstSeenAt: now, ...columns });
      stats.created++;
    } else if (sameListing(existing, columns)) {
      listingTouches.push(existing.id);
      stats.unchanged++;
    } else {
      listingUpdates.push({ id: existing.id, set: columns });
      stats.updated++;
    }
  }
  // Olemasolevad pakkumised, millel selles snapshot'is müügis seadmeid pole → laoseis (säilinud seadmed) / 0
  for (const existing of existingListings) {
    if (groupListingIds.has(existing.id)) continue;
    const stock = stockByListing.get(existing.id) ?? 0;
    if (existing.stock === stock && existing.available === stock > 0) continue;
    listingUpdates.push({ id: existing.id, set: { stock, available: stock > 0, lastSyncedAt: now } });
    if (stock === 0 && existing.available !== false) stats.madeUnavailable++;
    else stats.updated++;
  }

  const changed = stats.created + stats.updated + stats.madeUnavailable + stats.modelsCreated + stats.unitsCreated + stats.unitsUpdated > 0;

  const write = async (target: Database) => {
    await target.transaction(async (tx) => {
      for (const chunk of chunks(modelInserts, 100)) await tx.insert(productModels).values(chunk);
      for (const chunk of chunks(listingInserts, 100)) await tx.insert(supplierListings).values(chunk);
      for (const { id, set } of listingUpdates) await tx.update(supplierListings).set(set).where(eq(supplierListings.id, id));
      for (const chunk of chunks(listingTouches, 500)) await tx.update(supplierListings).set({ lastSeenAt: now, lastSyncedAt: now }).where(inArray(supplierListings.id, chunk));
      for (const chunk of chunks(unitInserts, 200)) await tx.insert(supplierInventoryUnits).values(chunk);
      for (const { id, set } of unitUpdates) await tx.update(supplierInventoryUnits).set(set).where(eq(supplierInventoryUnits.id, id));
      for (const chunk of chunks(unitTouches, 500)) await tx.update(supplierInventoryUnits).set({ lastSeenAt: now }).where(inArray(supplierInventoryUnits.id, chunk));
    });
  };

  return { snapshot, trusted: trust.trusted, trustReason: trust.reason, stats, models, changed, write };
}

/** Töövihik → snapshot (fataalsed vead → TechSnapshotError) */
export function snapshotFromSheets(sheets: SheetData[]): TechSnapshot {
  return buildTechSnapshot(parseTechWorkbook(sheets));
}

export async function runTechSync(db: Database, options: TechSyncOptions): Promise<TechSyncResult> {
  const clock = options.now ?? (() => new Date());
  const startedAt = clock();
  const runId = await acquireSyncRun(db, { source: TECH_SOURCE, trigger: options.trigger, triggeredBy: options.triggeredBy, now: startedAt, leaseMs: options.leaseMs });
  if (!runId) {
    await options.log({ level: "INFO", message: "Tech sync jäi vahele: teine sync juba käib", details: { trigger: options.trigger } });
    return { status: "BUSY" };
  }
  await options.log({ level: "INFO", message: "Tech sync algas", details: { runId, trigger: options.trigger, triggeredBy: options.triggeredBy ?? null } });

  let partial: Partial<TechSyncStats> = {};
  try {
    // Eelmine edukas sync (logitase: WARN ainult siis, kui teadaolev jääk kasvas)
    const previous = await lastSuccessfulSyncRun(db, TECH_SOURCE);
    // XLSX → tabid (võrk + parsimine) ENNE tehingut
    const snapshot = snapshotFromSheets(await options.loadSheets());
    partial = { ...snapshot.counts };
    const plan = await planTechSync(db, snapshot, { now: clock(), allowLargeDrop: options.allowLargeDrop });
    await plan.write(db);
    const stats = { ...plan.stats, durationMs: clock().getTime() - startedAt.getTime() };
    const samples = sampleDetails(plan);
    await finishSyncRun(db, runId, { status: "SUCCESS", stats: { ...stats, ...samples, trustReason: plan.trustReason }, snapshotTrusted: plan.trusted, error: null, now: clock() });
    await options.log({
      level: syncLogLevel({
        status: "SUCCESS",
        trusted: plan.trusted,
        alerts: { conflicts: stats.conflicts },
        backlog: { unknownNoteRows: stats.unknownNoteRows, invalidRows: stats.invalidRows, enrichmentMissing: stats.enrichmentMissing },
        previous: previous?.stats,
      }),
      message: plan.trusted ? "Tech sync lõppes" : "Tech sync lõppes — snapshot polnud usaldusväärne, puuduvaid maha ei võetud",
      details: { runId, success: true, snapshotTrusted: plan.trusted, trustReason: plan.trustReason, ...stats, unknownNoteSample: samples.unknownNoteSample.slice(0, 20), conflictSample: samples.conflictSample.slice(0, 20), layoutWarnings: samples.layoutWarnings },
    });
    return { status: "SUCCESS", runId, stats, snapshotTrusted: plan.trusted, trustReason: plan.trustReason, changed: plan.changed, models: plan.models };
  } catch (error) {
    const message = describeTechError(error);
    const stats = { ...partial, durationMs: clock().getTime() - startedAt.getTime() };
    await finishSyncRun(db, runId, { status: "FAILED", stats, snapshotTrusted: null, error: message, now: clock() }).catch(() => undefined);
    await options.log({ level: "ERROR", message: "Tech sync ebaõnnestus — eelmine kataloog jäi alles", details: { runId, success: false, error: message, ...stats } });
    return { status: "FAILED", runId, error: message, stats };
  }
}

/** Admini/logi näidised: välja jäetud read (Tech ID + põhjus, ilma seerianumbrita), konfliktid, rikastuseta mudelid */
export function sampleDetails(plan: Pick<TechSyncPlan, "snapshot" | "models">) {
  const rowRef = (r: { sheet: string; rowNumber: number }) => `${r.sheet.trim()}!${r.rowNumber}`;
  const excluded = (status: string) =>
    plan.snapshot.rows
      .filter((r) => r.status === status)
      .slice(0, 100)
      .map((r) => ({ row: rowRef(r), techId: r.externalUnitId ?? r.source.techId, model: [r.source.brand, r.source.model].filter(Boolean).join(" "), reason: r.reasons.join("; "), noteK: r.source.noteK, noteL: r.source.noteL }));
  return {
    sheetReport: plan.snapshot.parse.sheets.map((s) => ({ name: s.name, role: s.role, laptopRows: s.laptopRows, sections: s.sections, layoutError: s.layoutError, warning: s.warning })),
    layoutWarnings: [...plan.snapshot.parse.layoutErrors, ...plan.snapshot.parse.warnings],
    unknownNoteSample: excluded("UNKNOWN_NOTE"),
    defectSample: excluded("DEFECT"),
    invalidSample: excluded("INVALID"),
    notLaptopSample: excluded("NOT_LAPTOP"),
    conflictSample: plan.snapshot.conflictSample.slice(0, 50),
    enrichmentMissingSample: plan.models.filter((m) => m.enrichment === "MISSING").map((m) => ({ slug: m.slug, title: m.title, reused: m.reused })).slice(0, 100),
  };
}

export function describeTechError(error: unknown): string {
  if (error instanceof TechSnapshotError) return `Vigane snapshot (${error.code}): ${error.message}`;
  const text = error instanceof Error ? `${error.name === "Error" ? "" : `${error.name}: `}${error.message}` : String(error);
  return text.replace(/postgres(ql)?:\/\/[^\s"']+/gi, "[DATABASE_URL]").slice(0, 1000);
}

function chunks<T>(items: T[], size: number): T[][] {
  const result: T[][] = [];
  for (let i = 0; i < items.length; i += size) result.push(items.slice(i, i + size));
  return result;
}

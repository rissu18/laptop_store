import { randomUUID } from "node:crypto";
import { and, eq, inArray, ne } from "drizzle-orm";
import { BRAND_NAMES } from "@/domain/catalog/types";
import type { ListingDetails } from "@/domain/catalog/listing-details";
import { FAULT_SEVERITY_LABELS } from "@/integrations/foxway/foxway-faults";
import { matchAppleModel } from "@/integrations/foxway/foxway-names";
import {
  FOXWAY_BATTERY_WARRANTY_MONTHS,
  FOXWAY_DELIVERY_DAYS,
  FOXWAY_MIN_WARRANTY_MONTHS,
  FOXWAY_NORMALIZER_VERSION,
  FOXWAY_SOURCE,
  FOXWAY_SUPPLIER_CODE,
  FOXWAY_VAT_SCHEME,
} from "@/integrations/foxway/foxway-normalizer";
import type { FoxwayFeedKey } from "@/integrations/foxway/foxway-schema";
import { FoxwaySnapshotError, buildFoxwaySnapshot, decideFoxwayTrust, type FoxwayFeedInput, type FoxwaySnapshot, type FoxwaySnapshotOffer } from "@/integrations/foxway/foxway-snapshot";
import { stableStringify } from "@/integrations/supplier/stable-stringify";
import type { Database } from "@/server/db/client";
import { icecatMetadata, listingImages, productImages, productModels, supplierListings } from "@/server/db/schema";
import type { LogLevel } from "@/server/logging/system-log";
import { modeOf } from "./laptopid-sync";
import { acquireSyncRun, finishSyncRun, type SyncTrigger } from "./sync-runs";

/**
 * Foxway API → PostgreSQL (vt docs/FOXWAY_SYNC.md).
 *
 *   1. lukk (catalog_sync_runs, allikas FOXWAY)
 *   2. 4 feed'i (working/new × PC/Mac) — KÕIK peavad õnnestuma (võrgutöö ENNE tehingut)
 *   3. normaliseerimine + rikete/seisukorra ohutus + dedup SKU järgi (kogust ei liideta)
 *   4. usaldusväärsus (puuduvaid võetakse maha ainult usaldusväärse snapshot'iga)
 *   5. mudelid: olemasolev (täpne slug / Apple võtmed) või uus minimaalne; olemasolevat mudelit EI muudeta
 *   6. pakkumised (identiteet foxway + SKU) ühe tehinguga; puuduv → laoseis 0 + available=false (ei kustutata)
 *
 * Sync kirjutab ainult tarnija veerge — manual_overrides, status, featured, description, product_model_id
 * (olemasoleval pakkumisel) jäävad puutumata. Idempotentne: sama snapshot kaks korda → teisel korral ainult ajatemplid.
 */

type ModelRow = typeof productModels.$inferSelect;
type ListingRow = typeof supplierListings.$inferSelect;

export interface FoxwaySyncOptions {
  trigger: SyncTrigger;
  triggeredBy?: string | null;
  /** Admin kinnitas teadlikult suure muutuse (palju SKU-sid kadus korraga) */
  allowLargeDrop?: boolean;
  /** Feed'id (päris: Foxway API; testid: fikstuurid). Viga → sync FAILED, kataloog jääb samaks. */
  loadFeeds: () => Promise<FoxwayFeedInput[]>;
  log: (entry: { level: LogLevel; message: string; details?: Record<string, unknown> }) => Promise<void>;
  now?: () => Date;
  leaseMs?: number;
}

export type FoxwayImageStatus = "REUSED" | "ENRICHED" | "MISSING";

export interface FoxwaySyncStats {
  fetchedWorkingPc: number;
  fetchedWorkingMac: number;
  fetchedNewPc: number;
  fetchedNewMac: number;
  lines: number;
  invalidRows: number;
  uniqueSkus: number;
  duplicateSkus: number;
  duplicateConflicts: number;
  totalQuantity: number;
  /** Poes nähtavad (hold puudub, kogus > 0) */
  publishable: number;
  blocked: number;
  review: number;
  created: number;
  updated: number;
  unchanged: number;
  madeUnavailable: number;
  /** Puudusid feed'ist, aga jäeti alles, sest snapshot polnud usaldusväärne */
  missingNotDeactivated: number;
  /** Olemasolev pakkumine, mille rida oli vigane → ülevaatusele */
  invalidHeld: number;
  modelsReused: number;
  modelsCreated: number;
  imagesReused: number;
  imagesEnriched: number;
  imagesMissing: number;
  taxonomyWarnings: number;
  durationMs: number;
}

export interface FoxwayModelReport {
  slug: string;
  title: string;
  reused: boolean;
  matchedBy: "SLUG" | "APPLE_KEYS" | "EXISTING_LISTING" | "NEW";
  images: FoxwayImageStatus;
  listings: number;
}

export interface FoxwaySyncPlan {
  snapshot: FoxwaySnapshot;
  trusted: boolean;
  trustReason: string | null;
  stats: FoxwaySyncStats;
  models: FoxwayModelReport[];
  changed: boolean;
  write: (db: Database) => Promise<void>;
}

export type FoxwaySyncResult =
  | { status: "BUSY" }
  | { status: "SUCCESS"; runId: string; stats: FoxwaySyncStats; snapshotTrusted: boolean; trustReason: string | null; changed: boolean }
  | { status: "FAILED"; runId: string; error: string; stats: Partial<FoxwaySyncStats> };

/** Sama mudeli teiste tarnijate (Laptopid.ee) andmed: pikem garantii ja täpne resolutsioon (Maci "Retina" puhul) */
export interface FoxwayModelContext {
  warrantyMonths: number | null;
  resolution: string | null;
}

/** Meie garantii kliendile: vähemalt 12 kuud; kui sama mudeli Laptopid.ee andmetes on pikem, kehtib pikem. */
export function foxwayWarrantyMonths(modelWarrantyMonths: number | null): number {
  return Math.max(FOXWAY_MIN_WARRANTY_MONTHS, modelWarrantyMonths ?? 0);
}

/** Tarnija veerud, mida sync kirjutab. Admini väljad (status, manual_overrides, featured …) siin EI OLE. */
export function foxwayListingColumns(offer: FoxwaySnapshotOffer, context: FoxwayModelContext, now: Date) {
  const resolutionFromModel = offer.resolution === null && context.resolution !== null;
  const details: ListingDetails = {
    source: FOXWAY_SOURCE,
    sourceGrade: offer.dims.appearance,
    keyboardRaw: offer.keyboard.known ? null : offer.keyboard.raw,
    storageType: offer.storageType,
    secondaryStorage: offer.secondaryStorage,
    conditionNotices: offer.condition.notes.map((n) => ({ severity: n.severity, text: n.text, short: n.short })),
    chargerLabel: offer.charger.customerLabel,
    originalBox: offer.charger.originalBox,
    batteryWarrantyMonths: FOXWAY_BATTERY_WARRANTY_MONTHS,
    resolutionFromModel: resolutionFromModel || null,
  };
  return {
    supplierSku: offer.sku,
    cpu: offer.cpu,
    cpuFamily: offer.cpuFamily,
    cpuGeneration: offer.cpuGeneration,
    ramGb: offer.ramGb,
    ramType: null,
    storageGb: offer.storageGb,
    gpu: offer.gpu,
    gpuDedicated: offer.gpuDedicated,
    screenSizeIn: offer.name.screenSizeIn,
    resolution: offer.resolution ?? context.resolution,
    resolutionLabel: offer.resolutionLabel,
    panel: null,
    touchscreen: offer.touchscreen,
    keyboard: offer.keyboard.code,
    grade: offer.grade,
    features: offer.features,
    operatingSystem: offer.operatingSystem,
    warrantyMonths: foxwayWarrantyMonths(context.warrantyMonths),
    // Foxway "Battery status" (Excellent/Holds Charge …) EI OLE kliendi aku lubadus — ainult admin/toorandmed
    batteryHealthPct: null,
    // Klient saab alati laadija (Unboxed puhul lisame ise, hinnas laadija lisatasu)
    chargerIncluded: true,
    // Täpne laoseis Foxwayst (erinevalt Laptopid.ee teadmata kogusest)
    stock: offer.quantity,
    available: offer.quantity > 0,
    deliveryMinDays: FOXWAY_DELIVERY_DAYS.min,
    deliveryMaxDays: FOXWAY_DELIVERY_DAYS.max,
    supplierPriceCents: offer.price?.costCents ?? null,
    vatScheme: FOXWAY_VAT_SCHEME,
    salePriceCents: offer.price?.salePriceCents ?? null,
    priceSource: "SUPPLIER" as const,
    weightKg: null,
    conditionNotes: null,
    details,
    supplierVatMargin: offer.isVatMargin,
    qualityHold: offer.hold,
    qualityHoldReason: offer.holdReasons.join("; ") || null,
    rawData: foxwayRawData(offer),
    lastSyncedAt: now,
    lastSeenAt: now,
  };
}

/**
 * Admini/hanke metaandmed + Foxway toorread. Pood seda EI loe (poe päringud ei vali raw_data veergu).
 * Tellimuse hanke snapshot (order_item_procurements) võtab siit SKU/ItemVariantId/hinnakirja hinna.
 */
export function foxwayRawData(offer: FoxwaySnapshotOffer) {
  return {
    normalizerVersion: FOXWAY_NORMALIZER_VERSION,
    foxway: {
      sku: offer.sku,
      itemVariantId: offer.itemVariantId,
      productName: offer.productName,
      catalogs: offer.catalogs,
      canonicalCatalog: offer.canonicalCatalog,
      itemGroupId: offer.itemGroupId,
      quantity: offer.quantity,
      sourcePriceCents: offer.sourcePriceCents,
      currency: offer.currency,
      isVatMargin: offer.isVatMargin,
      ean: offer.ean,
      mpn: offer.mpn,
      appearance: offer.dims.appearance,
      functionality: offer.dims.functionality,
      boxed: offer.dims.boxed,
      keyboard: offer.dims.keyboard,
      batteryStatus: offer.dims.battery,
      faultPrimary: offer.dims.faultPrimary,
      faultAdditional: offer.dims.faultAdditional,
      faultSeverity: offer.condition.severity,
      faults: offer.condition.faults.map((f) => ({ raw: f.raw, severity: f.severity, known: f.known, reason: f.reason })),
      color: offer.dims.color,
      coa: offer.dims.coa,
      lcd: offer.dims.lcd,
      gpu: offer.dims.gpu,
      drive: offer.dims.drive,
      charger: { profile: offer.charger.profile, surchargeCents: offer.charger.surchargeCents, reason: offer.charger.reason },
      pricing: offer.price,
      hold: offer.hold,
      holdReasons: offer.holdReasons,
    },
    lines: offer.sources.map((s) => ({ feed: s.feed, catalog: s.catalog, line: s.line })),
  };
}

type ListingColumns = ReturnType<typeof foxwayListingColumns>;
const IGNORED_FOR_CHANGE = new Set(["lastSyncedAt", "lastSeenAt"]);

function sameListing(existing: ListingRow, columns: ListingColumns): boolean {
  const keys = (Object.keys(columns) as (keyof ListingColumns)[]).filter((k) => !IGNORED_FOR_CHANGE.has(k));
  const pick = (row: Record<string, unknown>) => Object.fromEntries(keys.map((k) => [k, row[k] ?? null]));
  return stableStringify(pick(existing as unknown as Record<string, unknown>)) === stableStringify(pick(columns as unknown as Record<string, unknown>));
}

function emptyStats(): FoxwaySyncStats {
  return {
    fetchedWorkingPc: 0, fetchedWorkingMac: 0, fetchedNewPc: 0, fetchedNewMac: 0, lines: 0, invalidRows: 0, uniqueSkus: 0, duplicateSkus: 0,
    duplicateConflicts: 0, totalQuantity: 0, publishable: 0, blocked: 0, review: 0, created: 0, updated: 0, unchanged: 0, madeUnavailable: 0,
    missingNotDeactivated: 0, invalidHeld: 0, modelsReused: 0, modelsCreated: 0, imagesReused: 0, imagesEnriched: 0, imagesMissing: 0,
    taxonomyWarnings: 0, durationMs: 0,
  };
}

const FEED_STAT: Record<FoxwayFeedKey, keyof FoxwaySyncStats> = { workingPc: "fetchedWorkingPc", workingMac: "fetchedWorkingMac", newPc: "fetchedNewPc", newMac: "fetchedNewMac" };

/** Snapshot → kirjutamise plaan (loeb andmebaasi, EI kirjuta). Kasutavad päris sync ja kuivkäivitus. */
export async function planFoxwaySync(db: Database, snapshot: FoxwaySnapshot, options: { now: Date; allowLargeDrop?: boolean }): Promise<FoxwaySyncPlan> {
  const { now } = options;
  const stats = emptyStats();
  for (const feed of snapshot.feeds) (stats[FEED_STAT[feed.key]] as number) = feed.rows;
  Object.assign(stats, {
    lines: snapshot.counts.lines,
    invalidRows: snapshot.counts.invalidRows,
    uniqueSkus: snapshot.counts.uniqueSkus,
    duplicateSkus: snapshot.counts.duplicateSkus,
    duplicateConflicts: snapshot.counts.duplicateConflicts,
    totalQuantity: snapshot.counts.totalQuantity,
    publishable: snapshot.offers.filter((o) => !o.hold && o.quantity > 0).length,
    blocked: snapshot.offers.filter((o) => o.hold === "BLOCKED").length,
    review: snapshot.offers.filter((o) => o.hold === "REVIEW").length,
  });

  const existingListings = await db.select().from(supplierListings).where(eq(supplierListings.supplier, FOXWAY_SUPPLIER_CODE));
  const listingBySku = new Map(existingListings.map((l) => [l.supplierProductId, l]));
  const trust = decideFoxwayTrust(
    snapshot,
    { availableSkus: existingListings.filter((l) => l.available === true).map((l) => l.supplierProductId) },
    { allowLargeDrop: options.allowLargeDrop },
  );

  // ---- Mudelid (ainult uutele pakkumistele; olemasoleva pakkumise mudeli seos on admini väli) ----
  const newOffers = snapshot.offers.filter((o) => !listingBySku.has(o.sku));
  const slugs = [...new Set(newOffers.map((o) => o.model.slug))];
  const needsApple = newOffers.some((o) => o.name.apple);
  const [slugModels, appleModels] = await Promise.all([
    slugs.length ? db.select().from(productModels).where(inArray(productModels.slug, slugs)) : Promise.resolve([] as ModelRow[]),
    needsApple ? db.select().from(productModels).where(eq(productModels.manufacturer, "apple")) : Promise.resolve([] as ModelRow[]),
  ]);
  const modelBySlug = new Map(slugModels.map((m) => [m.slug, m]));
  const modelById = new Map([...slugModels, ...appleModels].map((m) => [m.id, m]));
  const modelIdBySlug = new Map<string, string>();
  const matchedBy = new Map<string, FoxwayModelReport["matchedBy"]>();
  const modelInserts: (typeof productModels.$inferInsert)[] = [];
  const offersBySlug = new Map<string, FoxwaySnapshotOffer[]>();
  for (const offer of newOffers) offersBySlug.set(offer.model.slug, [...(offersBySlug.get(offer.model.slug) ?? []), offer]);
  for (const [slug, offers] of offersBySlug) {
    const exact = modelBySlug.get(slug);
    if (exact) {
      modelIdBySlug.set(slug, exact.id);
      matchedBy.set(exact.id, "SLUG");
      continue;
    }
    // Apple: Laptopid.ee mudelitel teine kirjapilt ("MacBook Air M2 2022") → seeria + aasta + ekraan + kiip
    const apple = offers[0].name.apple;
    const appleMatch = apple ? matchAppleModel(apple, appleModels.map((m) => ({ id: m.id, family: m.family, model: m.model, screenSizeIn: m.screenSizeIn }))) : null;
    if (appleMatch) {
      modelIdBySlug.set(slug, appleMatch);
      matchedBy.set(appleMatch, "APPLE_KEYS");
      continue;
    }
    const ref = offers[0].model;
    const id = randomUUID();
    modelIdBySlug.set(slug, id);
    matchedBy.set(id, "NEW");
    modelInserts.push({
      id,
      slug,
      manufacturer: ref.brand,
      family: ref.series,
      model: ref.model,
      generation: ref.generation,
      screenSizeIn: modeOf(offers.map((o) => o.name.screenSizeIn)),
      // Kaal, pordid, Wi-Fi, Bluetooth: Foxway ei anna → NULL (ei leiutata)
      weightKg: null,
      usbAPorts: null,
      usbCPorts: null,
      wifi: null,
      bluetooth: null,
      status: "ACTIVE",
      featured: false,
    });
  }
  const modelIdForOffer = (offer: FoxwaySnapshotOffer) => listingBySku.get(offer.sku)?.productModelId ?? modelIdBySlug.get(offer.model.slug)!;
  for (const listing of existingListings) if (!matchedBy.has(listing.productModelId)) matchedBy.set(listing.productModelId, "EXISTING_LISTING");

  // ---- Sama mudeli kontekst teistelt tarnijatelt + piltide seis ----
  const usedModelIds = [...new Set(snapshot.offers.map(modelIdForOffer))];
  const existingModelIds = usedModelIds.filter((id) => !modelInserts.some((m) => m.id === id));
  const [otherListings, modelImageRows, icecatRows, siblingImageRows, extraModels] = existingModelIds.length
    ? await Promise.all([
        db
          .select({ modelId: supplierListings.productModelId, warrantyMonths: supplierListings.warrantyMonths, resolution: supplierListings.resolution })
          .from(supplierListings)
          .where(and(inArray(supplierListings.productModelId, existingModelIds), ne(supplierListings.supplier, FOXWAY_SUPPLIER_CODE), eq(supplierListings.status, "ACTIVE"))),
        db.selectDistinct({ modelId: productImages.productModelId }).from(productImages).where(and(inArray(productImages.productModelId, existingModelIds), eq(productImages.isHidden, false))),
        db.select({ modelId: icecatMetadata.productModelId }).from(icecatMetadata).where(and(inArray(icecatMetadata.productModelId, existingModelIds), eq(icecatMetadata.status, "MATCHED"))),
        db
          .selectDistinct({ modelId: supplierListings.productModelId })
          .from(listingImages)
          .innerJoin(supplierListings, eq(listingImages.supplierListingId, supplierListings.id))
          .where(and(inArray(supplierListings.productModelId, existingModelIds), eq(listingImages.isHidden, false))),
        db.select().from(productModels).where(inArray(productModels.id, existingModelIds.filter((id) => !modelById.has(id)))),
      ])
    : [[], [], [], [], []];
  for (const m of extraModels) modelById.set(m.id, m);
  const contextByModel = new Map<string, FoxwayModelContext>();
  for (const id of existingModelIds) {
    const rows = otherListings.filter((r) => r.modelId === id);
    const warranties = rows.map((r) => r.warrantyMonths).filter((w): w is number => typeof w === "number" && w > 0);
    const resolutions = [...new Set(rows.map((r) => r.resolution).filter((r): r is string => Boolean(r)))];
    contextByModel.set(id, { warrantyMonths: warranties.length ? Math.max(...warranties) : null, resolution: resolutions.length === 1 ? resolutions[0] : null });
  }
  const withModelImages = new Set(modelImageRows.map((r) => r.modelId));
  const withIcecat = new Set(icecatRows.map((r) => r.modelId));
  const withSiblingImages = new Set(siblingImageRows.map((r) => r.modelId));
  const imageStatus = (id: string): FoxwayImageStatus => (withIcecat.has(id) ? "ENRICHED" : withModelImages.has(id) || withSiblingImages.has(id) ? "REUSED" : "MISSING");

  const listingsByModel = new Map<string, FoxwaySnapshotOffer[]>();
  for (const offer of snapshot.offers) listingsByModel.set(modelIdForOffer(offer), [...(listingsByModel.get(modelIdForOffer(offer)) ?? []), offer]);
  const models: FoxwayModelReport[] = [...listingsByModel].map(([id, offers]) => {
    const existing = modelById.get(id);
    const inserted = modelInserts.find((m) => m.id === id);
    const ref = offers[0].model;
    return {
      slug: existing?.slug ?? inserted?.slug ?? ref.slug,
      title: existing ? `${BRAND_NAMES[existing.manufacturer as keyof typeof BRAND_NAMES] ?? existing.manufacturer} ${existing.family} ${existing.model}`.replace(/\s+/g, " ") : ref.title,
      reused: !inserted,
      matchedBy: matchedBy.get(id) ?? "EXISTING_LISTING",
      images: inserted ? "MISSING" : imageStatus(id),
      listings: offers.length,
    };
  });
  stats.modelsCreated = modelInserts.length;
  stats.modelsReused = models.filter((m) => m.reused).length;
  stats.imagesReused = models.filter((m) => m.images === "REUSED").length;
  stats.imagesEnriched = models.filter((m) => m.images === "ENRICHED").length;
  stats.imagesMissing = models.filter((m) => m.images === "MISSING").length;
  stats.taxonomyWarnings = new Set(newOffers.filter((o) => o.model.taxonomyWarning).map((o) => o.model.slug)).size;

  // ---- Pakkumised ----
  const listingInserts: (typeof supplierListings.$inferInsert)[] = [];
  const listingUpdates: { id: string; set: Partial<ListingRow> }[] = [];
  const listingTouches: string[] = [];
  for (const offer of snapshot.offers) {
    const modelId = modelIdForOffer(offer);
    const columns = foxwayListingColumns(offer, contextByModel.get(modelId) ?? { warrantyMonths: null, resolution: null }, now);
    const existing = listingBySku.get(offer.sku);
    if (!existing) {
      listingInserts.push({ id: randomUUID(), productModelId: modelId, supplier: FOXWAY_SUPPLIER_CODE, supplierProductId: offer.sku, sku: foxwaySku(offer.sku), firstSeenAt: now, ...columns });
      stats.created++;
    } else if (sameListing(existing, columns)) {
      listingTouches.push(existing.id);
      stats.unchanged++;
    } else {
      listingUpdates.push({ id: existing.id, set: columns });
      stats.updated++;
      if (existing.available !== false && !columns.available) stats.madeUnavailable++;
    }
  }
  // Vigane rida kehtiva SKU-ga: olemasolev pakkumine jääb, aga läheb ülevaatusele (andmeid ei arvata)
  const offerSkus = new Set(snapshot.offers.map((o) => o.sku));
  for (const bad of snapshot.invalid) {
    const existing = bad.sku && !offerSkus.has(bad.sku) ? listingBySku.get(bad.sku) : undefined;
    if (!existing) continue;
    const reason = `Foxway rida vigane: ${bad.reasons.join("; ")}`;
    if (existing.qualityHold === "REVIEW" && existing.qualityHoldReason === reason) continue;
    listingUpdates.push({ id: existing.id, set: { qualityHold: "REVIEW", qualityHoldReason: reason, lastSyncedAt: now } });
    stats.invalidHeld++;
  }
  // Puuduvad SKU-d: maha ainult usaldusväärse snapshot'iga (laoseis 0, rida ja ajalugu jäävad)
  for (const existing of existingListings) {
    if (snapshot.seenSkus.has(existing.supplierProductId)) continue;
    if (existing.available === false && existing.stock === 0) continue;
    if (trust.trusted) {
      listingUpdates.push({ id: existing.id, set: { stock: 0, available: false, lastSyncedAt: now } });
      stats.madeUnavailable++;
    } else if (existing.available !== false) {
      stats.missingNotDeactivated++;
    }
  }

  const changed = stats.created + stats.updated + stats.madeUnavailable + stats.modelsCreated + stats.invalidHeld > 0;

  const write = async (target: Database) => {
    await target.transaction(async (tx) => {
      for (const chunk of chunks(modelInserts, 100)) await tx.insert(productModels).values(chunk);
      for (const chunk of chunks(listingInserts, 100)) await tx.insert(supplierListings).values(chunk);
      for (const { id, set } of listingUpdates) await tx.update(supplierListings).set(set).where(eq(supplierListings.id, id));
      for (const chunk of chunks(listingTouches, 500)) await tx.update(supplierListings).set({ lastSeenAt: now, lastSyncedAt: now }).where(inArray(supplierListings.id, chunk));
    });
  };

  return { snapshot, trusted: trust.trusted, trustReason: trust.reason, stats, models, changed, write };
}

/** Meie SKU Foxway pakkumisele (unikaalne üle tarnijate): FX-<Foxway SKU> */
export function foxwaySku(supplierSku: string): string {
  return `FX-${supplierSku}`;
}

export async function runFoxwaySync(db: Database, options: FoxwaySyncOptions): Promise<FoxwaySyncResult> {
  const clock = options.now ?? (() => new Date());
  const startedAt = clock();
  const runId = await acquireSyncRun(db, { source: FOXWAY_SOURCE, trigger: options.trigger, triggeredBy: options.triggeredBy, now: startedAt, leaseMs: options.leaseMs });
  if (!runId) {
    await options.log({ level: "INFO", message: "Foxway sync jäi vahele: teine sync juba käib", details: { trigger: options.trigger } });
    return { status: "BUSY" };
  }
  await options.log({ level: "INFO", message: "Foxway sync algas", details: { runId, trigger: options.trigger, triggeredBy: options.triggeredBy ?? null } });

  let partial: Partial<FoxwaySyncStats> = {};
  try {
    // Kõik 4 feed'i (võrk) ENNE tehingut — ükskõik milline viga → FAILED, midagi ei muudeta
    const snapshot = buildFoxwaySnapshot(await options.loadFeeds());
    partial = { ...snapshot.counts };
    const plan = await planFoxwaySync(db, snapshot, { now: clock(), allowLargeDrop: options.allowLargeDrop });
    await plan.write(db);
    const stats = { ...plan.stats, durationMs: clock().getTime() - startedAt.getTime() };
    const samples = foxwaySampleDetails(plan);
    await finishSyncRun(db, runId, { status: "SUCCESS", stats: { ...stats, ...samples, trustReason: plan.trustReason }, snapshotTrusted: plan.trusted, error: null, now: clock() });
    const warn = !plan.trusted || stats.duplicateConflicts > 0 || stats.review > 0 || stats.invalidRows > 0 || samples.unknownFaults.length > 0;
    await options.log({
      level: warn ? "WARN" : "INFO",
      message: plan.trusted ? "Foxway sync lõppes" : "Foxway sync lõppes — snapshot polnud usaldusväärne, puuduvaid maha ei võetud",
      details: {
        runId,
        success: true,
        snapshotTrusted: plan.trusted,
        trustReason: plan.trustReason,
        ...stats,
        unknownFaults: samples.unknownFaults,
        duplicateSample: samples.duplicateSample.slice(0, 20),
        invalidSample: samples.invalidSample.slice(0, 20),
      },
    });
    return { status: "SUCCESS", runId, stats, snapshotTrusted: plan.trusted, trustReason: plan.trustReason, changed: plan.changed };
  } catch (error) {
    const message = describeFoxwayError(error);
    const stats = { ...partial, durationMs: clock().getTime() - startedAt.getTime() };
    await finishSyncRun(db, runId, { status: "FAILED", stats, snapshotTrusted: null, error: message, now: clock() }).catch(() => undefined);
    await options.log({ level: "ERROR", message: "Foxway sync ebaõnnestus — eelmine kataloog jäi alles", details: { runId, success: false, error: message, ...stats } });
    return { status: "FAILED", runId, error: message, stats };
  }
}

/** Admini/logi näidised (catalog_sync_runs.stats): blokeeritud, ülevaatus, vigased, duplikaadid, tundmatud rikked */
export function foxwaySampleDetails(plan: Pick<FoxwaySyncPlan, "snapshot" | "models">) {
  const offerSample = (hold: "BLOCKED" | "REVIEW") =>
    plan.snapshot.offers
      .filter((o) => o.hold === hold)
      .slice(0, 150)
      .map((o) => ({ sku: o.sku, productName: o.productName, quantity: o.quantity, appearance: o.dims.appearance, reasons: o.holdReasons }));
  const unknownFaults = new Map<string, number>();
  for (const offer of plan.snapshot.offers) for (const fault of offer.condition.faults) if (!fault.known) unknownFaults.set(fault.raw, (unknownFaults.get(fault.raw) ?? 0) + 1);
  const faultCounts = new Map<string, { severity: string; count: number }>();
  for (const offer of plan.snapshot.offers) {
    for (const fault of offer.condition.faults) {
      const current = faultCounts.get(fault.raw) ?? { severity: FAULT_SEVERITY_LABELS[fault.severity], count: 0 };
      current.count++;
      faultCounts.set(fault.raw, current);
    }
  }
  return {
    feedReport: plan.snapshot.feeds,
    blockedSample: offerSample("BLOCKED"),
    reviewSample: offerSample("REVIEW"),
    invalidSample: plan.snapshot.invalid.slice(0, 100),
    duplicateSample: plan.snapshot.duplicates.slice(0, 100),
    unknownFaults: [...unknownFaults].map(([raw, count]) => ({ raw, count })),
    faultSummary: [...faultCounts].map(([raw, v]) => ({ raw, ...v })).sort((a, b) => b.count - a.count),
    imagesMissingSample: plan.models.filter((m) => m.images === "MISSING").map((m) => ({ slug: m.slug, title: m.title, reused: m.reused })).slice(0, 150),
    appleMatches: plan.models.filter((m) => m.matchedBy === "APPLE_KEYS").map((m) => ({ slug: m.slug, title: m.title })),
  };
}

export function describeFoxwayError(error: unknown): string {
  if (error instanceof FoxwaySnapshotError) return `Vigane snapshot (${error.code}): ${error.message}`;
  const text = error instanceof Error ? `${error.name === "Error" ? "" : `${error.name}: `}${error.message}` : String(error);
  return text.replace(/postgres(ql)?:\/\/[^\s"']+/gi, "[DATABASE_URL]").slice(0, 1000);
}

function chunks<T>(items: T[], size: number): T[][] {
  const result: T[][] = [];
  for (let i = 0; i < items.length; i += size) result.push(items.slice(i, i + size));
  return result;
}

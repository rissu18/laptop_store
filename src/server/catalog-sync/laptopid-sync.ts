import { randomUUID } from "node:crypto";
import { and, eq, inArray } from "drizzle-orm";
import { buildAltText } from "@/domain/images/product-image";
import {
  LAPTOPID_NORMALIZER_VERSION,
  LAPTOPID_SOURCE,
  LAPTOPID_SUPPLIER_CODE,
  type LaptopidOffer,
} from "@/integrations/laptopid/laptopid-normalizer";
import { LaptopidSnapshotError, decideSnapshotTrust, parseLaptopidSnapshot, type SnapshotRejection } from "@/integrations/laptopid/laptopid-snapshot";
import { stableStringify } from "@/integrations/supplier/stable-stringify";
import { mapWithConcurrency } from "@/server/concurrency/map-with-concurrency";
import type { Database } from "@/server/db/client";
import { listingImages, productModels, supplierListings } from "@/server/db/schema";
import type { LogLevel } from "@/server/logging/system-log";
import type { ImageSizeProbe } from "./image-probe";
import { syncLogLevel } from "@/domain/catalog/sync-log-level";
import { acquireSyncRun, finishSyncRun, lastSuccessfulSyncRun, type SyncTrigger } from "./sync-runs";

/**
 * Laptopid.ee → PostgreSQL sync (vt docs/LAPTOPID_SYNC.md).
 *
 *   1. lukk (catalog_sync_runs)          6. pakkumiste upsert (tarnija veerud; manual_overrides EI puututa)
 *   2. API (tooted + pildid)              7. pildid (uutel loetakse mõõdud)
 *   3. valideerimine                      8. lastSeenAt / lastSyncedAt
 *   4. normaliseerimine                   9. puuduvad → available=false (AINULT usaldusväärse täieliku snapshot'iga)
 *   5. mudelite leidmine/loomine         10. logi + luku vabastamine
 *
 * Kõik võrgutööd (API, pildi mõõdud) tehakse ENNE andmebaasi tehingut; kõik kirjutamised on ühes tehingus.
 * Viga mistahes sammus → tehing ei käivitu või rullitakse tagasi → eelmine kataloog jääb alles.
 * Idempotentne: sama vastus kaks korda → teisel korral ainult lastSeenAt muutub.
 */

type ModelRow = typeof productModels.$inferSelect;
type ListingInsert = typeof supplierListings.$inferInsert;
type ImageRow = typeof listingImages.$inferSelect;

export interface LaptopidRawPayload {
  products: unknown;
  images: unknown;
}

export interface LaptopidSyncOptions {
  trigger: SyncTrigger;
  triggeredBy?: string | null;
  /** Admin kinnitas teadlikult suure muutuse (palju tooteid kadus korraga) */
  allowLargeDrop?: boolean;
  fetchRaw: () => Promise<LaptopidRawPayload>;
  probeImage: ImageSizeProbe;
  log: (entry: { level: LogLevel; message: string; details?: Record<string, unknown> }) => Promise<void>;
  now?: () => Date;
  leaseMs?: number;
}

export interface LaptopidSyncStats {
  received: number;
  valid: number;
  rejected: number;
  created: number;
  updated: number;
  unchanged: number;
  reactivated: number;
  madeUnavailable: number;
  /** Puudusid snapshot'ist, aga jäeti saadavaks, sest snapshot polnud usaldusväärne */
  missingNotDeactivated: number;
  modelsCreated: number;
  modelsUpdated: number;
  imagesAdded: number;
  imagesUpdated: number;
  imagesRemoved: number;
  imageErrors: number;
  /** Pakkumised, mille mudel (nimi) muutus tarnija poolel — mudeli seost sync ei muuda */
  modelMismatches: number;
  /** Imporditud, aga seeria taksonoomia oli tundmatu (tagavara-seeria) — vt taxonomyWarningSample */
  taxonomyWarnings: number;
  durationMs: number;
}

export type LaptopidSyncResult =
  | { status: "BUSY" }
  | { status: "SUCCESS"; runId: string; stats: LaptopidSyncStats; snapshotTrusted: boolean; trustReason: string | null; rejected: SnapshotRejection[]; changed: boolean }
  | { status: "FAILED"; runId: string; error: string; stats: Partial<LaptopidSyncStats> };

const emptyStats = (): LaptopidSyncStats => ({
  received: 0,
  valid: 0,
  rejected: 0,
  created: 0,
  updated: 0,
  unchanged: 0,
  reactivated: 0,
  madeUnavailable: 0,
  missingNotDeactivated: 0,
  modelsCreated: 0,
  modelsUpdated: 0,
  imagesAdded: 0,
  imagesUpdated: 0,
  imagesRemoved: 0,
  imageErrors: 0,
  modelMismatches: 0,
  taxonomyWarnings: 0,
  durationMs: 0,
});

export { stableStringify };

/** Sagedaseim väärtus (viik → väiksem); null-e ei arvestata */
export function modeOf(values: (number | null | undefined)[]): number | null {
  const counts = new Map<number, number>();
  for (const v of values) if (v !== null && v !== undefined) counts.set(v, (counts.get(v) ?? 0) + 1);
  let best: number | null = null;
  let bestCount = 0;
  for (const [value, count] of counts) {
    if (count > bestCount || (count === bestCount && best !== null && value < best)) {
      best = value;
      bestCount = count;
    }
  }
  return best;
}

/** Mudeli tarnija veerud kõigist selle mudeli pakkumistest snapshot'is (sama mudel → sama väärtus). */
export function modelColumnsFromOffers(offers: LaptopidOffer[]) {
  const first = offers[0].model;
  return {
    manufacturer: first.brand,
    family: first.series,
    model: first.model,
    generation: first.generation,
    screenSizeIn: modeOf(offers.map((o) => o.listing.screenSizeIn)),
    weightKg: modeOf(offers.map((o) => o.listing.weightKg)),
    usbAPorts: modeOf(offers.map((o) => o.listing.details.usbA)),
    usbCPorts: modeOf(offers.map((o) => o.listing.details.usbC)),
    // Laptopid API ei anna Wi-Fi ega Bluetoothi andmeid → teadmata (ei mõelda välja)
    wifi: null,
    bluetooth: null,
  };
}

function rawDataOf(offer: LaptopidOffer) {
  return { normalizerVersion: LAPTOPID_NORMALIZER_VERSION, product: offer.raw, images: offer.images };
}

/** Tarnija veerud, mida sync kirjutab. Admini väljad (status, manual_overrides, featured …) siin EI OLE. */
function listingSupplierColumns(offer: LaptopidOffer, now: Date) {
  const l = offer.listing;
  return {
    supplierSku: l.supplierSku,
    cpu: l.cpu,
    cpuFamily: l.cpuFamily,
    cpuGeneration: l.cpuGeneration,
    ramGb: l.ramGb,
    ramType: l.ramType,
    storageGb: l.storageGb,
    gpu: l.gpu,
    gpuDedicated: l.gpuDedicated,
    screenSizeIn: l.screenSizeIn,
    resolution: l.resolution,
    resolutionLabel: l.resolutionLabel,
    panel: l.panel,
    touchscreen: l.touchscreen,
    keyboard: l.keyboard,
    grade: l.grade,
    features: l.features,
    operatingSystem: l.operatingSystem,
    warrantyMonths: l.warrantyMonths,
    batteryHealthPct: null,
    chargerIncluded: null,
    // Laptopid annab ainult saadavuse: aktiivses nimekirjas = vähemalt 1 tk laos, täpne kogus TEADMATA
    stock: null,
    available: true,
    deliveryMinDays: null,
    deliveryMaxDays: null,
    // sale_price on müügihind, new_price on kontekst — kumbki EI OLE ostuhind
    supplierPriceCents: null,
    vatScheme: null,
    salePriceCents: l.salePriceCents,
    priceSource: "SUPPLIER" as const,
    weightKg: l.weightKg,
    conditionNotes: l.conditionNotes,
    details: l.details,
    rawData: rawDataOf(offer),
    lastSyncedAt: now,
    lastSeenAt: now,
  };
}

interface ImageInsert {
  row: typeof listingImages.$inferInsert;
}

export async function runLaptopidSync(db: Database, options: LaptopidSyncOptions): Promise<LaptopidSyncResult> {
  const clock = options.now ?? (() => new Date());
  const startedAt = clock();
  const runId = await acquireSyncRun(db, { source: LAPTOPID_SOURCE, trigger: options.trigger, triggeredBy: options.triggeredBy, now: startedAt, leaseMs: options.leaseMs });
  if (!runId) {
    await options.log({ level: "INFO", message: "Laptopid sync jäi vahele: teine sync juba käib", details: { trigger: options.trigger } });
    return { status: "BUSY" };
  }
  await options.log({ level: "INFO", message: "Laptopid sync algas", details: { runId, trigger: options.trigger, triggeredBy: options.triggeredBy ?? null } });

  const stats = emptyStats();
  try {
    // Eelmine edukas sync (logitase: WARN ainult siis, kui teadaolev jääk kasvas)
    const previous = await lastSuccessfulSyncRun(db, LAPTOPID_SOURCE);
    // 2–4. API → valideerimine → normaliseerimine (viga = DB-d ei puututa)
    const raw = await options.fetchRaw();
    const snapshot = parseLaptopidSnapshot(raw.products, raw.images);
    stats.received = snapshot.receivedCount;
    stats.valid = snapshot.offers.length;
    stats.rejected = snapshot.rejected.length;

    const now = clock();
    const existingListings = await db.select().from(supplierListings).where(eq(supplierListings.supplier, LAPTOPID_SUPPLIER_CODE));
    const listingByExternalId = new Map(existingListings.map((l) => [l.supplierProductId, l]));
    const trust = decideSnapshotTrust(
      snapshot,
      existingListings.filter((l) => l.available === true).map((l) => l.supplierProductId),
      { allowLargeDrop: options.allowLargeDrop },
    );

    // 5. Mudelid: kanooniline slug (tootja + seeria + mudel). Kindel vaste = sama slug; muidu uus mudel.
    const offersBySlug = new Map<string, LaptopidOffer[]>();
    for (const offer of snapshot.offers) offersBySlug.set(offer.model.slug, [...(offersBySlug.get(offer.model.slug) ?? []), offer]);
    const slugs = [...offersBySlug.keys()];
    const existingModels: ModelRow[] = slugs.length ? await db.select().from(productModels).where(inArray(productModels.slug, slugs)) : [];
    const modelBySlug = new Map(existingModels.map((m) => [m.slug, m]));
    const existingModelById = new Map<string, ModelRow>();
    const linkedModelIds = [...new Set(existingListings.map((l) => l.productModelId))];
    if (linkedModelIds.length) {
      for (const m of await db.select().from(productModels).where(inArray(productModels.id, linkedModelIds))) existingModelById.set(m.id, m);
    }

    const modelInserts: (typeof productModels.$inferInsert)[] = [];
    const modelUpdates: { id: string; set: ReturnType<typeof modelColumnsFromOffers> }[] = [];
    const modelIdBySlug = new Map<string, string>();
    for (const [slug, offers] of offersBySlug) {
      const columns = modelColumnsFromOffers(offers);
      const existing = modelBySlug.get(slug);
      if (!existing) {
        const id = randomUUID();
        modelInserts.push({ id, slug, ...columns, status: "ACTIVE", featured: false });
        modelIdBySlug.set(slug, id);
        continue;
      }
      modelIdBySlug.set(slug, existing.id);
      const current = Object.fromEntries(Object.keys(columns).map((k) => [k, existing[k as keyof ModelRow] ?? null]));
      if (stableStringify(current) !== stableStringify(columns)) modelUpdates.push({ id: existing.id, set: columns });
    }
    stats.modelsCreated = modelInserts.length;
    stats.modelsUpdated = modelUpdates.length;

    // 6. Pakkumised
    const listingInserts: ListingInsert[] = [];
    const listingUpdates: { id: string; set: ReturnType<typeof listingSupplierColumns> }[] = [];
    const unchangedIds: string[] = [];
    const listingIdByExternalId = new Map<string, string>();
    const titleByListingId = new Map<string, string>();
    for (const offer of snapshot.offers) {
      const existing = listingByExternalId.get(offer.externalId);
      const columns = listingSupplierColumns(offer, now);
      if (!existing) {
        const id = randomUUID();
        listingInserts.push({
          id,
          productModelId: modelIdBySlug.get(offer.model.slug)!,
          supplier: LAPTOPID_SUPPLIER_CODE,
          supplierProductId: offer.externalId,
          sku: offer.sku,
          firstSeenAt: now,
          ...columns,
        });
        listingIdByExternalId.set(offer.externalId, id);
        titleByListingId.set(id, offer.model.title);
        continue;
      }
      listingIdByExternalId.set(offer.externalId, existing.id);
      titleByListingId.set(existing.id, offer.model.title);
      const linkedModel = existingModelById.get(existing.productModelId);
      if (linkedModel && linkedModel.slug !== offer.model.slug) stats.modelMismatches++;

      const sameData = stableStringify(existing.rawData) === stableStringify(columns.rawData);
      if (sameData && existing.available === true && existing.priceSource === "SUPPLIER") {
        unchangedIds.push(existing.id);
      } else {
        if (existing.available === false) stats.reactivated++;
        listingUpdates.push({ id: existing.id, set: columns });
      }
    }
    stats.created = listingInserts.length;
    stats.updated = listingUpdates.length;
    stats.unchanged = unchangedIds.length;

    // 9. (plaan) Puuduvad pakkumised — ainult usaldusväärse snapshot'iga
    const missingListingIds = trust.trusted
      ? trust.missingIds.map((externalId) => listingByExternalId.get(externalId)!.id)
      : [];
    stats.madeUnavailable = missingListingIds.length;
    stats.missingNotDeactivated = trust.trusted ? 0 : trust.missingIds.length;

    // 7. Pildid: olemasolevad vs soovitud; uutel loetakse mõõdud (võrk — enne tehingut)
    const existingIds = new Set(existingListings.map((l) => l.id));
    const presentListingIds = [...listingIdByExternalId.values()].filter((id) => existingIds.has(id));
    const existingImages: ImageRow[] = presentListingIds.length
      ? await db.select().from(listingImages).where(and(inArray(listingImages.supplierListingId, presentListingIds), eq(listingImages.source, LAPTOPID_SOURCE)))
      : [];
    const imagesByListing = new Map<string, ImageRow[]>();
    for (const image of existingImages) imagesByListing.set(image.supplierListingId, [...(imagesByListing.get(image.supplierListingId) ?? []), image]);

    const toProbe: { listingId: string; image: LaptopidOffer["images"][number] }[] = [];
    const imageUpdates: { id: string; set: Partial<ImageRow> }[] = [];
    const imageDeletes: string[] = [];
    for (const offer of snapshot.offers) {
      const listingId = listingIdByExternalId.get(offer.externalId)!;
      const title = titleByListingId.get(listingId)!;
      const current = new Map((imagesByListing.get(listingId) ?? []).map((row) => [row.sourceId, row]));
      for (const image of offer.images) {
        const row = current.get(image.sourceId);
        current.delete(image.sourceId);
        if (!row) {
          toProbe.push({ listingId, image });
          continue;
        }
        const desired = { position: image.position, thumbnailUrl: image.thumbnailUrl, mediumUrl: image.mediumUrl, largeUrl: image.largeUrl, alt: buildAltText(title, image.position) };
        const actual = { position: row.position, thumbnailUrl: row.thumbnailUrl, mediumUrl: row.mediumUrl, largeUrl: row.largeUrl, alt: row.alt };
        if (stableStringify(desired) !== stableStringify(actual)) imageUpdates.push({ id: row.id, set: desired });
      }
      for (const stale of current.values()) imageDeletes.push(stale.id);
    }
    const probed = await mapWithConcurrency(toProbe, 8, async ({ listingId, image }) => {
      const size = await options.probeImage(image.largeUrl);
      if (!size) return null;
      const title = titleByListingId.get(listingId)!;
      const insert: ImageInsert = {
        row: {
          supplierListingId: listingId,
          source: LAPTOPID_SOURCE,
          sourceId: image.sourceId,
          position: image.position,
          thumbnailUrl: image.thumbnailUrl,
          mediumUrl: image.mediumUrl,
          largeUrl: image.largeUrl,
          width: size.width,
          height: size.height,
          alt: buildAltText(title, image.position),
        },
      };
      return insert;
    });
    const imageInserts = probed.filter((p): p is ImageInsert => p !== null).map((p) => p.row);
    stats.imageErrors = probed.length - imageInserts.length;
    stats.imagesAdded = imageInserts.length;
    stats.imagesUpdated = imageUpdates.length;
    stats.imagesRemoved = imageDeletes.length;

    // Kõik kirjutamised ühes tehingus
    await db.transaction(async (tx) => {
      for (const chunk of chunks(modelInserts, 100)) await tx.insert(productModels).values(chunk);
      for (const { id, set } of modelUpdates) await tx.update(productModels).set(set).where(eq(productModels.id, id));
      for (const chunk of chunks(listingInserts, 100)) await tx.insert(supplierListings).values(chunk);
      for (const { id, set } of listingUpdates) await tx.update(supplierListings).set(set).where(eq(supplierListings.id, id));
      for (const chunk of chunks(unchangedIds, 500)) await tx.update(supplierListings).set({ lastSeenAt: now, lastSyncedAt: now }).where(inArray(supplierListings.id, chunk));
      for (const chunk of chunks(missingListingIds, 500)) {
        await tx.update(supplierListings).set({ available: false, lastSyncedAt: now }).where(and(inArray(supplierListings.id, chunk), eq(supplierListings.available, true)));
      }
      for (const chunk of chunks(imageDeletes, 500)) await tx.delete(listingImages).where(inArray(listingImages.id, chunk));
      for (const { id, set } of imageUpdates) await tx.update(listingImages).set(set).where(eq(listingImages.id, id));
      for (const chunk of chunks(imageInserts, 200)) await tx.insert(listingImages).values(chunk).onConflictDoNothing();
    });

    stats.durationMs = clock().getTime() - startedAt.getTime();
    const changed =
      stats.created + stats.updated + stats.madeUnavailable + stats.modelsCreated + stats.modelsUpdated + stats.imagesAdded + stats.imagesUpdated + stats.imagesRemoved > 0;
    const rejectedSample = snapshot.rejected.slice(0, 50);
    const taxonomyWarningSample = snapshot.offers.flatMap((o) => (o.model.taxonomyWarning ? [{ externalId: o.externalId, message: o.model.taxonomyWarning }] : []));
    stats.taxonomyWarnings = taxonomyWarningSample.length;
    await finishSyncRun(db, runId, {
      status: "SUCCESS",
      stats: { ...stats, rejectedSample, taxonomyWarningSample: taxonomyWarningSample.slice(0, 50), trustReason: trust.reason },
      snapshotTrusted: trust.trusted,
      error: null,
      now: clock(),
    });
    await options.log({
      level: syncLogLevel({
        status: "SUCCESS",
        trusted: trust.trusted,
        backlog: { imageErrors: stats.imageErrors, taxonomyWarnings: stats.taxonomyWarnings },
        previous: previous?.stats,
      }),
      message: trust.trusted ? "Laptopid sync lõppes" : "Laptopid sync lõppes — snapshot polnud usaldusväärne, puuduvaid maha ei võetud",
      details: { runId, success: true, snapshotTrusted: trust.trusted, trustReason: trust.reason, ...stats, rejectedSample: rejectedSample.slice(0, 20), taxonomyWarningSample: taxonomyWarningSample.slice(0, 20) },
    });
    return { status: "SUCCESS", runId, stats, snapshotTrusted: trust.trusted, trustReason: trust.reason, rejected: snapshot.rejected, changed };
  } catch (error) {
    const message = describeError(error);
    stats.durationMs = clock().getTime() - startedAt.getTime();
    await finishSyncRun(db, runId, { status: "FAILED", stats: { ...stats }, snapshotTrusted: null, error: message, now: clock() }).catch(() => undefined);
    await options.log({ level: "ERROR", message: "Laptopid sync ebaõnnestus — eelmine kataloog jäi alles", details: { runId, success: false, error: message, ...stats } });
    return { status: "FAILED", runId, error: message, stats };
  }
}

function describeError(error: unknown): string {
  if (error instanceof LaptopidSnapshotError) return `Vigane snapshot (${error.code}): ${error.message}`;
  const text = error instanceof Error ? `${error.name === "Error" ? "" : `${error.name}: `}${error.message}` : String(error);
  return text.replace(/postgres(ql)?:\/\/[^\s"']+/gi, "[DATABASE_URL]").slice(0, 1000);
}

function chunks<T>(items: T[], size: number): T[][] {
  const result: T[][] = [];
  for (let i = 0; i < items.length; i += size) result.push(items.slice(i, i + size));
  return result;
}

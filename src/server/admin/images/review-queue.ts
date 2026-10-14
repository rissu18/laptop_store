import "server-only";
import { and, eq, inArray, sql } from "drizzle-orm";
import { adminModelTitle } from "@/domain/admin/display";
import { imageState, type ImageState } from "@/domain/admin/image-state";
import { requireAdmin } from "@/server/auth/auth";
import { effectiveModel } from "@/server/catalog/db-catalog-mapper";
import { getDb } from "@/server/db/client";
import { icecatMetadata, productIdentifiers, productImages, productModels } from "@/server/db/schema";
import { getSellableSnapshot, type SellableSnapshot } from "../sellable";

/**
 * Admin → Pildid → Ülevaatus: Icecati otsuseid vajavad mudelid. Vaikimisi ainult MÜÜGIS mudelid (sama reegel mis
 * pood), järjekord: müügis enne → rohkem poes nähtavaid konfiguratsioone → nimi.
 */

/** Vahelehed: ülevaatus, kinnitatud-aga-pildid-puudu, tagasi lükatud, vaste puudub (nt Apple — ainult käsitsi ID) */
export const REVIEW_QUEUE_STATES = ["REVIEW", "MATCHED_NO_IMAGES", "REJECTED", "NO_MATCH"] as const;
export type ReviewQueueState = (typeof REVIEW_QUEUE_STATES)[number];
export const REVIEW_PAGE_SIZE = 20;

export interface ReviewQueueFilters {
  state: ReviewQueueState;
  scope: "sellable" | "all";
  brand?: string;
  page: number;
}

export interface ReviewQueueRow {
  modelId: string;
  title: string;
  manufacturer: string;
  sellable: boolean;
  sellableListings: number;
  galleryCount: number | null;
  icecatImages: number;
  otherImages: number;
  state: ImageState;
  icecat: { status: string; icecatId: string | null; icecatTitle: string | null; matchType: string | null; confidence: number | null; matchedBy: string | null; reason: string | null } | null;
  rejectedIds: string[];
  /** Rikastuse märkus (nt Apple: "ainult käsitsi vaste") */
  hint: string | null;
}

const icecatVisible = sql<number>`(SELECT count(*)::int FROM ${productImages} WHERE ${productImages.productModelId} = ${productModels.id} AND NOT ${productImages.isHidden} AND ${productImages.source} = 'ICECAT')`;
const otherVisible = sql<number>`(SELECT count(*)::int FROM ${productImages} WHERE ${productImages.productModelId} = ${productModels.id} AND NOT ${productImages.isHidden} AND ${productImages.source} <> 'ICECAT')`;

/** Järjekord: müügis → poes nähtavaid konfiguratsioone rohkem → nimi. */
export function sortReviewQueue<T extends { sellable: boolean; sellableListings: number; title: string }>(rows: T[]): T[] {
  return [...rows].sort((a, b) => Number(b.sellable) - Number(a.sellable) || b.sellableListings - a.sellableListings || a.title.localeCompare(b.title, "et"));
}

export function buildReviewRows(
  rows: { model: typeof productModels.$inferSelect; meta: typeof icecatMetadata.$inferSelect | null; icecatImages: number; otherImages: number }[],
  rejected: Map<string, string[]>,
  snapshot: Pick<SellableSnapshot, "modelIds" | "sellableCountByModel" | "galleryByModel">,
): ReviewQueueRow[] {
  const sellableIds = new Set(snapshot.modelIds);
  return rows.map(({ model: raw, meta, icecatImages, otherImages }) => {
    const model = effectiveModel(raw);
    return {
      modelId: model.id,
      title: adminModelTitle(model),
      manufacturer: model.manufacturer,
      sellable: sellableIds.has(model.id),
      sellableListings: snapshot.sellableCountByModel.get(model.id) ?? 0,
      galleryCount: snapshot.galleryByModel.get(model.id) ?? null,
      icecatImages,
      otherImages,
      state: imageState({ icecatStatus: meta?.status ?? null, icecatImages, otherImages }),
      icecat: meta ? { status: meta.status, icecatId: meta.icecatId, icecatTitle: meta.icecatTitle, matchType: meta.matchType, confidence: meta.confidence, matchedBy: meta.matchedBy, reason: meta.reason } : null,
      rejectedIds: rejected.get(model.id) ?? [],
      hint: (raw.enrichment as { images?: { icecat?: string } } | null)?.images?.icecat ?? null,
    };
  });
}

/** Vahelehe tingimus (Icecati staatus + tegelik pildiseis) */
export function inQueueTab(row: Pick<ReviewQueueRow, "state" | "icecat">, tab: ReviewQueueState): boolean {
  const status = row.icecat?.status ?? null;
  if (tab === "NO_MATCH") return status !== "MATCHED" && status !== "NEEDS_REVIEW" && status !== "REJECTED";
  return row.state === tab;
}

export async function getIcecatReviewQueue(filters: ReviewQueueFilters) {
  await requireAdmin();
  const db = getDb();
  const snapshot = await getSellableSnapshot();
  const conditions = [];
  if (filters.brand) conditions.push(sql`(CASE WHEN ${productModels.manualOverrides} ? 'manufacturer' THEN ${productModels.manualOverrides}->>'manufacturer' ELSE ${productModels.manufacturer} END) = ${filters.brand}`);
  const raw = await db
    .select({ model: productModels, meta: icecatMetadata, icecatImages: icecatVisible, otherImages: otherVisible })
    .from(productModels)
    .leftJoin(icecatMetadata, eq(icecatMetadata.productModelId, productModels.id))
    .where(and(...conditions));
  const rejectedRows = raw.length
    ? await db
        .select({ modelId: productIdentifiers.productModelId, value: productIdentifiers.value })
        .from(productIdentifiers)
        .where(and(eq(productIdentifiers.kind, "REJECTED_ICECAT_ID"), inArray(productIdentifiers.productModelId, raw.map((r) => r.model.id))))
    : [];
  const rejected = new Map<string, string[]>();
  for (const row of rejectedRows) rejected.set(row.modelId, [...(rejected.get(row.modelId) ?? []), row.value]);

  const all = buildReviewRows(raw, rejected, snapshot);
  const counts = Object.fromEntries(
    REVIEW_QUEUE_STATES.map((tab) => [tab, { sellable: all.filter((r) => inQueueTab(r, tab) && r.sellable).length, all: all.filter((r) => inQueueTab(r, tab)).length }]),
  ) as Record<ReviewQueueState, { sellable: number; all: number }>;
  const matching = sortReviewQueue(all.filter((row) => inQueueTab(row, filters.state) && (filters.scope === "all" || row.sellable)));
  const pageCount = Math.max(1, Math.ceil(matching.length / REVIEW_PAGE_SIZE));
  const page = Math.min(filters.page, pageCount);
  return { rows: matching.slice((page - 1) * REVIEW_PAGE_SIZE, page * REVIEW_PAGE_SIZE), total: matching.length, page, pageCount, counts };
}

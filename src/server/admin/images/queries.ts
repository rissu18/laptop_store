import "server-only";
import { and, asc, count, eq, sql, type SQL } from "drizzle-orm";
import { imageState } from "@/domain/admin/image-state";
import { requireAdmin } from "@/server/auth/auth";
import { effectiveModel } from "@/server/catalog/db-catalog-mapper";
import { getDb } from "@/server/db/client";
import { icecatMetadata, productImages, productModels } from "@/server/db/schema";
import { ADMIN_PAGE_SIZE } from "../products/queries";

export interface ImageListFilters {
  coverage?: "with" | "without" | "single";
  icecat?: string;
  page: number;
}

/** Piltide ülevaade mudelite kaupa (pildid on mudeli tasemel). */
export async function listModelImageSummaries(filters: ImageListFilters) {
  await requireAdmin();
  const db = getDb();
  const visible = sql<number>`(SELECT count(*)::int FROM ${productImages} WHERE ${productImages.productModelId} = ${productModels.id} AND NOT ${productImages.isHidden})`;
  const hidden = sql<number>`(SELECT count(*)::int FROM ${productImages} WHERE ${productImages.productModelId} = ${productModels.id} AND ${productImages.isHidden})`;
  const icecatVisible = sql<number>`(SELECT count(*)::int FROM ${productImages} WHERE ${productImages.productModelId} = ${productModels.id} AND NOT ${productImages.isHidden} AND ${productImages.source} = 'ICECAT')`;
  const mainThumb = sql<string | null>`(SELECT ${productImages.thumbnailPath} FROM ${productImages} WHERE ${productImages.productModelId} = ${productModels.id} AND NOT ${productImages.isHidden} ORDER BY ${productImages.isMain} DESC, ${productImages.position} ASC LIMIT 1)`;
  const conditions: SQL[] = [];
  if (filters.coverage === "with") conditions.push(sql`${visible} > 0`);
  if (filters.coverage === "without") conditions.push(sql`${visible} = 0`);
  if (filters.coverage === "single") conditions.push(sql`${visible} = 1`);
  if (filters.icecat) conditions.push(eq(icecatMetadata.status, filters.icecat as "MATCHED"));
  const where = conditions.length ? and(...conditions) : undefined;

  const [rows, [{ total }]] = await Promise.all([
    db
      .select({ model: productModels, visible, hidden, icecatVisible, mainThumb, icecatStatus: icecatMetadata.status, icecatId: icecatMetadata.icecatId })
      .from(productModels)
      .leftJoin(icecatMetadata, eq(icecatMetadata.productModelId, productModels.id))
      .where(where)
      .orderBy(asc(productModels.manufacturer), asc(productModels.family), asc(productModels.model))
      .limit(ADMIN_PAGE_SIZE)
      .offset((filters.page - 1) * ADMIN_PAGE_SIZE),
    db.select({ total: count() }).from(productModels).leftJoin(icecatMetadata, eq(icecatMetadata.productModelId, productModels.id)).where(where),
  ]);
  return {
    rows: rows.map((row) => ({
      ...row,
      model: effectiveModel(row.model),
      state: imageState({ icecatStatus: row.icecatStatus, icecatImages: row.icecatVisible, otherImages: row.visible - row.icecatVisible }),
    })), total, pageCount: Math.max(1, Math.ceil(total / ADMIN_PAGE_SIZE)) };
}

export async function getModelImages(modelId: string) {
  await requireAdmin();
  const db = getDb();
  const [model] = await db.select().from(productModels).where(eq(productModels.id, modelId)).limit(1);
  if (!model) return null;
  const [images, icecat] = await Promise.all([
    db.select().from(productImages).where(eq(productImages.productModelId, modelId)).orderBy(asc(productImages.position)),
    db.select().from(icecatMetadata).where(eq(icecatMetadata.productModelId, modelId)).limit(1),
  ]);
  return { model: effectiveModel(model), images, icecat: icecat[0] ?? null };
}

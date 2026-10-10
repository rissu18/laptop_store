import { and, asc, eq, inArray, notInArray } from "drizzle-orm";
import type { IcecatMatchRecord, IcecatMatchStatus, IcecatMatchType, IcecatStatusReason } from "@/domain/images/icecat-match";
import type { ProductImageRecord } from "@/domain/images/product-image";
import type { ModelIdentifiers } from "@/integrations/icecat/icecat-matcher";
import type { Database } from "@/server/db/client";
import { icecatMetadata, productIdentifiers, productImages, productModels } from "@/server/db/schema";
import type { ProductImageRepository } from "./image-repository";

/**
 * PostgreSQL-põhine pildihoidla (asendab JSON-failid). Sama liides, mida Icecati import kasutab,
 * seega impordi loogika ei muutunud. Mudelit tuvastatakse sluggi järgi (import töötab sluggidega).
 *
 * Admini otsused on kaitstud: korduv import ei muuda olemasolevate piltide järjekorda ega põhipilti;
 * peitmine (isHidden) tuleb impordi kirjest, mis omakorda säilitab eelmise väärtuse.
 */
type ImageRow = typeof productImages.$inferSelect;

export function imageRowToRecord(row: ImageRow, slug: string): ProductImageRecord {
  return {
    id: row.id,
    productModelId: slug,
    source: row.source,
    sourceId: row.sourceId,
    type: row.type,
    position: row.position,
    isMain: row.isMain,
    thumbnailUrl: row.thumbnailPath,
    mediumUrl: row.mediumPath,
    largeUrl: row.largePath,
    width: row.width,
    height: row.height,
    alt: row.alt,
    originalSourceUrl: row.originalSourceUrl ?? "",
    sourceUpdatedAt: row.sourceUpdatedAt,
    downloadedAt: (row.downloadedAt ?? row.createdAt).toISOString(),
    storageKeys: row.storageKeys ?? [],
    contentHash: row.contentHash,
    isHidden: row.isHidden,
  };
}

export class DbImageRepository implements ProductImageRepository {
  constructor(private readonly db: Database) {}

  private async modelId(slug: string): Promise<string> {
    const [row] = await this.db.select({ id: productModels.id }).from(productModels).where(eq(productModels.slug, slug)).limit(1);
    if (!row) throw new Error(`Mudelit ${slug} pole andmebaasis`);
    return row.id;
  }

  async listImages(slug: string): Promise<ProductImageRecord[]> {
    const id = await this.modelId(slug);
    const rows = await this.db.select().from(productImages).where(eq(productImages.productModelId, id)).orderBy(asc(productImages.position));
    return rows.map((row) => imageRowToRecord(row, slug));
  }

  async replaceImages(slug: string, records: ProductImageRecord[]): Promise<void> {
    const id = await this.modelId(slug);
    await this.db.transaction(async (tx) => {
      const keep = records.map((r) => r.sourceId);
      // Eemaldatud pildid (Icecatis enam pole, duplikaadid, vaste kadus)
      await tx
        .delete(productImages)
        .where(and(eq(productImages.productModelId, id), eq(productImages.source, "ICECAT"), keep.length ? notInArray(productImages.sourceId, keep) : undefined));
      for (const image of records) {
        const fileColumns = {
          thumbnailPath: image.thumbnailUrl,
          mediumPath: image.mediumUrl,
          largePath: image.largeUrl,
          width: image.width,
          height: image.height,
          alt: image.alt,
          type: image.type,
          originalSourceUrl: image.originalSourceUrl,
          sourceUpdatedAt: image.sourceUpdatedAt,
          contentHash: image.contentHash,
          storageKeys: image.storageKeys,
          downloadedAt: new Date(image.downloadedAt),
          isHidden: image.isHidden,
        };
        await tx
          .insert(productImages)
          .values({ productModelId: id, source: image.source, sourceId: image.sourceId, position: image.position, isMain: image.isMain, ...fileColumns })
          .onConflictDoUpdate({ target: [productImages.productModelId, productImages.source, productImages.sourceId], set: fileColumns });
      }
      await normalizeImageOrder(tx, id);
    });
  }

  async setImageHidden(slug: string, sourceId: string, hidden: boolean): Promise<boolean> {
    const id = await this.modelId(slug);
    const updated = await this.db
      .update(productImages)
      .set({ isHidden: hidden })
      .where(and(eq(productImages.productModelId, id), eq(productImages.sourceId, sourceId)))
      .returning({ id: productImages.id });
    if (updated.length) await normalizeImageOrder(this.db, id);
    return updated.length > 0;
  }

  async listAllImages(): Promise<Record<string, ProductImageRecord[]>> {
    const rows = await this.db
      .select({ image: productImages, slug: productModels.slug })
      .from(productImages)
      .innerJoin(productModels, eq(productModels.id, productImages.productModelId))
      .orderBy(asc(productModels.slug), asc(productImages.position));
    const result: Record<string, ProductImageRecord[]> = {};
    for (const { image, slug } of rows) (result[slug] ??= []).push(imageRowToRecord(image, slug));
    return result;
  }

  async getMatch(slug: string): Promise<IcecatMatchRecord | null> {
    const [row] = await this.db
      .select({ match: icecatMetadata, slug: productModels.slug })
      .from(icecatMetadata)
      .innerJoin(productModels, eq(productModels.id, icecatMetadata.productModelId))
      .where(eq(productModels.slug, slug))
      .limit(1);
    return row ? metadataToRecord(row.match, row.slug) : null;
  }

  async saveMatch(record: IcecatMatchRecord): Promise<void> {
    const id = await this.modelId(record.productModelId);
    const values = {
      status: record.status,
      reason: record.reason,
      matchType: record.matchType,
      confidence: record.confidence,
      icecatId: record.icecatId,
      icecatTitle: record.icecatTitle,
      matchedBy: record.matchedBy,
      titleVerified: record.titleVerified,
      imageCount: record.imageCount,
      error: record.error,
      checkedAt: new Date(record.checkedAt),
    };
    await this.db.insert(icecatMetadata).values({ productModelId: id, ...values }).onConflictDoUpdate({ target: icecatMetadata.productModelId, set: values });
  }

  async listMatches(): Promise<IcecatMatchRecord[]> {
    const rows = await this.db.select({ match: icecatMetadata, slug: productModels.slug }).from(icecatMetadata).innerJoin(productModels, eq(productModels.id, icecatMetadata.productModelId));
    return rows.map((row) => metadataToRecord(row.match, row.slug));
  }
}

function metadataToRecord(row: typeof icecatMetadata.$inferSelect, slug: string): IcecatMatchRecord {
  return {
    productModelId: slug,
    status: row.status as IcecatMatchStatus,
    reason: row.reason as IcecatStatusReason | null,
    matchType: row.matchType as IcecatMatchType | null,
    confidence: row.confidence,
    icecatId: row.icecatId,
    icecatTitle: row.icecatTitle,
    matchedBy: row.matchedBy,
    titleVerified: row.titleVerified,
    imageCount: row.imageCount,
    checkedAt: row.checkedAt.toISOString(),
    error: row.error,
  };
}

/**
 * Hoiab järjekorra järjestikuse (0, 1, 2 …) ja tagab täpselt ühe põhipildi nähtavate seas
 * (kui põhipilt peideti, saab põhipildiks esimene nähtav).
 */
export async function normalizeImageOrder(db: Pick<Database, "select" | "update">, productModelId: string): Promise<void> {
  const rows = await db.select().from(productImages).where(eq(productImages.productModelId, productModelId)).orderBy(asc(productImages.position), asc(productImages.createdAt));
  const visibleMain = rows.find((row) => row.isMain && !row.isHidden) ?? rows.find((row) => !row.isHidden) ?? null;
  for (const [index, row] of rows.entries()) {
    const isMain = row.id === visibleMain?.id;
    if (row.position !== index || row.isMain !== isMain) await db.update(productImages).set({ position: index, isMain }).where(eq(productImages.id, row.id));
  }
}

/** Mudeli identifikaatorid Icecati päringuteks: tarnija GTIN/MPN enne käsitsi kogutuid + admini otsused. */
export async function loadModelIdentifiers(db: Database, productModelId: string): Promise<ModelIdentifiers> {
  const rows = await db.select().from(productIdentifiers).where(eq(productIdentifiers.productModelId, productModelId));
  const ordered = [...rows].sort((a, b) => Number(a.source !== "SUPPLIER") - Number(b.source !== "SUPPLIER"));
  const values = (kind: string) => [...new Set(ordered.filter((r) => r.kind === kind).map((r) => r.value))];
  return {
    gtins: values("GTIN"),
    mpns: values("MPN"),
    icecatIds: values("ICECAT_ID"),
    confirmedIcecatId: values("CONFIRMED_ICECAT_ID")[0],
    rejectedIcecatIds: values("REJECTED_ICECAT_ID"),
  };
}

export async function getImagesByIds(db: Database, ids: string[]) {
  if (!ids.length) return [];
  return db.select().from(productImages).where(inArray(productImages.id, ids));
}

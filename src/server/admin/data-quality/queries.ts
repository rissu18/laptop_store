import "server-only";
import { count, sql } from "drizzle-orm";
import { LISTING_ISSUES, MODEL_ISSUES, type ListingIssue, type ModelIssue } from "@/domain/admin/data-quality-rules";
import { requireAdmin } from "@/server/auth/auth";
import { getDb } from "@/server/db/client";
import { productModels, supplierListings } from "@/server/db/schema";
import { listingIssueCondition, modelIssueCondition } from "../products/queries";

export interface IssueCount<K extends string> {
  key: K;
  label: string;
  description: string;
  count: number;
}

/** Andmekvaliteedi ülevaade: iga kontrolli kohta probleemsete kirjete arv (efektiivsete väärtuste järgi). */
export async function getDataQualityCounts() {
  await requireAdmin();
  const db = getDb();
  const [modelTotal] = await db.select({ n: count() }).from(productModels);
  const [listingTotal] = await db.select({ n: count() }).from(supplierListings);

  const models = await Promise.all(
    (Object.keys(MODEL_ISSUES) as ModelIssue[]).map(async (key): Promise<IssueCount<ModelIssue>> => {
      const [row] = await db.select({ n: count() }).from(productModels).where(modelIssueCondition(key));
      return { key, ...MODEL_ISSUES[key], count: row.n };
    }),
  );
  const listings = await Promise.all(
    (Object.keys(LISTING_ISSUES) as ListingIssue[]).map(async (key): Promise<IssueCount<ListingIssue>> => {
      const [row] = await db.select({ n: count() }).from(supplierListings).where(listingIssueCondition(key));
      return { key, ...LISTING_ISSUES[key], count: row.n };
    }),
  );
  return { modelTotal: modelTotal.n, listingTotal: listingTotal.n, models, listings, imageSources: await getImageSourceCounts() };
}

export const IMAGE_SOURCE_LABELS = {
  ICECAT: "Icecat (alla laaditud)",
  LAPTOPID: "Laptopid.ee (mudeli pildid, rikastus)",
  LOCAL: "Muu meie pilt (admin)",
  LISTING: "Ainult pakkumise fotod (Laptopid.ee)",
  PLACEHOLDER: "Pilt puudub (placeholder)",
} as const;
export type ImageSourceKey = keyof typeof IMAGE_SOURCE_LABELS;

/** Mudelid poes kuvatava pildi päritolu järgi (esimene kehtiv: Icecat → Laptopid.ee → muu → pakkumise fotod → placeholder) */
async function getImageSourceCounts(): Promise<{ key: ImageSourceKey; label: string; all: number; onSale: number }[]> {
  const db = getDb();
  const rows = await db.execute<{ src: ImageSourceKey; total: number; on_sale: number }>(sql`
    WITH m AS (
      SELECT pm.id,
        EXISTS (SELECT 1 FROM supplier_listings sl WHERE sl.product_model_id = pm.id AND sl.status = 'ACTIVE' AND sl.available IS NOT FALSE AND sl.quality_hold IS NULL) AS on_sale,
        CASE
          WHEN EXISTS (SELECT 1 FROM product_images pi WHERE pi.product_model_id = pm.id AND NOT pi.is_hidden AND pi.source = 'ICECAT') THEN 'ICECAT'
          WHEN EXISTS (SELECT 1 FROM product_images pi WHERE pi.product_model_id = pm.id AND NOT pi.is_hidden AND pi.source = 'LAPTOPID') THEN 'LAPTOPID'
          WHEN EXISTS (SELECT 1 FROM product_images pi WHERE pi.product_model_id = pm.id AND NOT pi.is_hidden) THEN 'LOCAL'
          WHEN EXISTS (SELECT 1 FROM listing_images li JOIN supplier_listings sl ON sl.id = li.supplier_listing_id
                       WHERE sl.product_model_id = pm.id AND NOT li.is_hidden AND sl.status = 'ACTIVE' AND sl.available IS NOT FALSE) THEN 'LISTING'
          ELSE 'PLACEHOLDER'
        END AS src
      FROM product_models pm
    )
    SELECT src, count(*)::int AS total, count(*) FILTER (WHERE on_sale)::int AS on_sale FROM m GROUP BY src`);
  const byKey = new Map(rows.rows.map((r) => [r.src, r]));
  return (Object.keys(IMAGE_SOURCE_LABELS) as ImageSourceKey[]).map((key) => ({ key, label: IMAGE_SOURCE_LABELS[key], all: byKey.get(key)?.total ?? 0, onSale: byKey.get(key)?.on_sale ?? 0 }));
}

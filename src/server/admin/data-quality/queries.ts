import "server-only";
import { sql, type SQL } from "drizzle-orm";
import { LISTING_ISSUES, MODEL_ISSUES, type ListingIssue, type ModelIssue } from "@/domain/admin/data-quality-rules";
import { requireAdmin } from "@/server/auth/auth";
import { getDb } from "@/server/db/client";
import { productModels, supplierListings } from "@/server/db/schema";
import { listingIssueCondition, modelIssueCondition } from "../products/queries";
import { getSellableSnapshot, idIn, type CatalogScope, type SellableSnapshot } from "../sellable";

export interface IssueCount<K extends string> {
  key: K;
  label: string;
  description: string;
  count: number;
}

export interface PerformanceCoverageRow {
  key: "cpuBenchmark" | "gpuBenchmark" | "cpuMaxMhz";
  /** Vastav andmekvaliteedi kategooria (drill-down) */
  issue: ListingIssue;
  label: string;
  direct: number;
  matched: number;
  missing: number;
}

/** Ühe päringuga: iga kategooria kohta count(*) FILTER (WHERE …) */
const countsByKey = (keys: string[], condition: (key: string) => SQL) =>
  sql.join(
    keys.map((key, index) => sql`count(*) FILTER (WHERE ${condition(key)})::int AS ${sql.identifier(`c${index}`)}`),
    sql`, `,
  );

/**
 * Andmekvaliteedi ülevaade (efektiivsete väärtuste järgi). Vaikimisi skoop "Müügis" = poes nähtavad pakkumised ja
 * nende mudelid (sama reegel mis pood, vt sellable.ts); "Kõik" = kogu andmebaas (ka peidetud, arhiveeritud,
 * laoseisuta ja kinni peetud).
 */
export async function getDataQualityCounts(scope: CatalogScope = "sellable") {
  await requireAdmin();
  const db = getDb();
  const snapshot = await getSellableSnapshot();
  const modelScope = scope === "sellable" ? idIn(productModels.id, snapshot.modelIds) : sql`true`;
  const listingScope = scope === "sellable" ? idIn(supplierListings.id, snapshot.listingIds) : sql`true`;
  const modelKeys = Object.keys(MODEL_ISSUES) as ModelIssue[];
  const listingKeys = Object.keys(LISTING_ISSUES) as ListingIssue[];

  const [[modelRow], [listingRow], imageSources, coverage] = await Promise.all([
    db
      .execute<Record<string, number>>(sql`SELECT count(*)::int AS total, ${countsByKey(modelKeys, (key) => modelIssueCondition(key as ModelIssue, snapshot))} FROM ${productModels} WHERE ${modelScope}`)
      .then((r) => r.rows),
    db
      .execute<Record<string, number>>(sql`SELECT count(*)::int AS total, ${countsByKey(listingKeys, (key) => listingIssueCondition(key as ListingIssue))} FROM ${supplierListings} WHERE ${listingScope}`)
      .then((r) => r.rows),
    getImageSourceCounts(snapshot),
    getPerformanceCoverageRows(listingScope),
  ]);

  const models = modelKeys.map((key, i): IssueCount<ModelIssue> => ({ key, ...MODEL_ISSUES[key], count: Number(modelRow[`c${i}`] ?? 0) }));
  const listings = listingKeys.map((key, i): IssueCount<ListingIssue> => ({ key, ...LISTING_ISSUES[key], count: Number(listingRow[`c${i}`] ?? 0) }));
  const missingByIssue = new Map(listings.map((item) => [item.key, item.count]));
  return {
    scope,
    modelTotal: Number(modelRow.total),
    listingTotal: Number(listingRow.total),
    models,
    listings,
    imageSources,
    performance: { total: coverage.total, rows: coverage.rows.map((row) => ({ ...row, missing: missingByIssue.get(row.issue) ?? 0 })) },
  };
}

export const IMAGE_SOURCE_LABELS = {
  ICECAT: "Icecat (alla laaditud)",
  LAPTOPID: "Laptopid.ee (mudeli pildid, rikastus)",
  LOCAL: "Muu meie pilt (admin)",
  LISTING: "Ainult pakkumise fotod (Laptopid.ee)",
  PLACEHOLDER: "Pilt puudub (placeholder)",
} as const;
export type ImageSourceKey = keyof typeof IMAGE_SOURCE_LABELS;

/**
 * Mudelid poes kuvatava pildi päritolu järgi (esimene kehtiv: Icecat → Laptopid.ee → muu → pakkumise fotod → placeholder).
 * "Müügis" = vähemalt üks poes nähtav pakkumine (sama reegel mis pood).
 */
async function getImageSourceCounts(snapshot: SellableSnapshot): Promise<{ key: ImageSourceKey; label: string; all: number; onSale: number }[]> {
  const db = getDb();
  const onSale = snapshot.modelIds.length ? sql`pm.id IN ${snapshot.modelIds}` : sql`false`;
  const rows = await db.execute<{ src: ImageSourceKey; total: number; on_sale: number }>(sql`
    WITH m AS (
      SELECT pm.id,
        ${onSale} AS on_sale,
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

/**
 * Kiirusindeksi ja maks. sageduse kate: tarnija enda väärtus (details) / täpse CPU/GPU vastega Laptopid.ee väärtus
 * (enrichment). "Puudub" tuleb andmekvaliteedi kategooriast (sama reegel mis tooteleht), seega klikitav.
 * Admini CPU/GPU parandusega pakkumisel väärtust ei arvestata.
 */
async function getPerformanceCoverageRows(scope: SQL): Promise<{ total: number; rows: Omit<PerformanceCoverageRow, "missing">[] }> {
  const [r] = (
    await getDb().execute<Record<string, number>>(sql`
      SELECT count(*)::int AS total,
        count(*) FILTER (WHERE NOT manual_overrides ? 'cpu' AND (details->>'cpuBenchmark3dmark06') IS NOT NULL)::int AS cpu_direct,
        count(*) FILTER (WHERE NOT manual_overrides ? 'cpu' AND (details->>'cpuBenchmark3dmark06') IS NULL AND enrichment ? 'cpuBenchmark')::int AS cpu_matched,
        count(*) FILTER (WHERE NOT manual_overrides ? 'gpu' AND (details->>'gpuBenchmark3dmark11') IS NOT NULL)::int AS gpu_direct,
        count(*) FILTER (WHERE NOT manual_overrides ? 'gpu' AND (details->>'gpuBenchmark3dmark11') IS NULL AND enrichment ? 'gpuBenchmark')::int AS gpu_matched,
        count(*) FILTER (WHERE NOT manual_overrides ? 'cpu' AND (details->>'cpuMaxMhz') IS NOT NULL)::int AS mhz_direct,
        count(*) FILTER (WHERE NOT manual_overrides ? 'cpu' AND (details->>'cpuMaxMhz') IS NULL AND enrichment ? 'cpuMaxMhz')::int AS mhz_matched
      FROM ${supplierListings}
      WHERE ${scope}`)
  ).rows;
  return {
    total: r.total,
    rows: [
      { key: "cpuBenchmark", issue: "missing-cpu-benchmark", label: "CPU kiirusindeks (3DMark06 CPU)", direct: r.cpu_direct, matched: r.cpu_matched },
      { key: "gpuBenchmark", issue: "missing-gpu-benchmark", label: "GPU kiirusindeks (3DMark11 GPU)", direct: r.gpu_direct, matched: r.gpu_matched },
      { key: "cpuMaxMhz", issue: "missing-cpu-max-mhz", label: "CPU maks. sagedus", direct: r.mhz_direct, matched: r.mhz_matched },
    ],
  };
}

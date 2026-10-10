import "server-only";
import { and, count, desc, eq, gte, sql } from "drizzle-orm";
import { requireAdmin } from "@/server/auth/auth";
import { getDb } from "@/server/db/client";
import { auditLogs, icecatMetadata, productImages, productModels, supplierListings, systemLogs } from "@/server/db/schema";
import { getDataQualityCounts } from "../data-quality/queries";

/**
 * Töölaua mõõdikud — kõik arvutatakse andmebaasist. Tellimusi, käivet ega kliente pole veel olemas,
 * seega neid ei kuvata (ei mingeid väljamõeldud numbreid).
 */
export async function getDashboard() {
  await requireAdmin();
  const db = getDb();
  const stockEff = sql`(CASE WHEN ${supplierListings.manualOverrides} ? 'stock' THEN (${supplierListings.manualOverrides}->>'stock')::int ELSE ${supplierListings.stock} END)`;
  const visibleImages = sql`(SELECT count(*) FROM ${productImages} WHERE ${productImages.productModelId} = ${productModels.id} AND NOT ${productImages.isHidden})`;

  const [modelStatus, listingStatus, [inStock], [featured], [withImages], [imageTotals], icecat, [prices], [errors24h], recent, quality] = await Promise.all([
    db.select({ status: productModels.status, n: count() }).from(productModels).groupBy(productModels.status),
    db.select({ status: supplierListings.status, n: count() }).from(supplierListings).groupBy(supplierListings.status),
    db.select({ n: count() }).from(supplierListings).where(and(eq(supplierListings.status, "ACTIVE"), sql`${stockEff} > 0`)),
    db.select({ n: count() }).from(productModels).where(eq(productModels.featured, true)),
    db.select({ n: count() }).from(productModels).where(sql`${visibleImages} > 0`),
    db.select({ total: count(), hidden: sql<number>`count(*) FILTER (WHERE ${productImages.isHidden})::int` }).from(productImages),
    db.select({ status: icecatMetadata.status, n: count() }).from(icecatMetadata).groupBy(icecatMetadata.status),
    db
      .select({
        min: sql<number | null>`min(${supplierListings.salePriceCents})::int`,
        avg: sql<number | null>`round(avg(${supplierListings.salePriceCents}))::int`,
        max: sql<number | null>`max(${supplierListings.salePriceCents})::int`,
      })
      .from(supplierListings)
      .where(and(eq(supplierListings.status, "ACTIVE"), sql`${supplierListings.salePriceCents} IS NOT NULL`)),
    db.select({ n: count() }).from(systemLogs).where(and(eq(systemLogs.level, "ERROR"), gte(systemLogs.createdAt, new Date(Date.now() - 86_400_000)))),
    db.select().from(auditLogs).orderBy(desc(auditLogs.createdAt), desc(auditLogs.id)).limit(6),
    getDataQualityCounts(),
  ]);

  const byStatus = (rows: { status: string; n: number }[]) => Object.fromEntries(rows.map((r) => [r.status, r.n])) as Record<string, number>;
  const models = byStatus(modelStatus);
  const listings = byStatus(listingStatus);
  const modelTotal = Object.values(models).reduce((a, b) => a + b, 0);
  const listingTotal = Object.values(listings).reduce((a, b) => a + b, 0);
  const issues = [...quality.models, ...quality.listings].filter((i) => i.count > 0).sort((a, b) => b.count - a.count);

  return {
    catalog: { modelTotal, modelsActive: models.ACTIVE ?? 0, modelsHidden: models.HIDDEN ?? 0, listingTotal, listingsActive: listings.ACTIVE ?? 0, listingsHidden: listings.HIDDEN ?? 0, inStock: inStock.n, featured: featured.n },
    images: {
      modelsWithImages: withImages.n,
      coveragePct: modelTotal ? Math.round((withImages.n / modelTotal) * 1000) / 10 : 0,
      total: imageTotals.total,
      hidden: imageTotals.hidden,
      icecat: byStatus(icecat),
    },
    prices,
    quality: { totalIssues: issues.reduce((sum, i) => sum + i.count, 0), top: issues.slice(0, 5) },
    system: { errors24h: errors24h.n },
    recent,
  };
}

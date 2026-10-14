import "server-only";
import { and, count, desc, eq, gte, notLike } from "drizzle-orm";
import { PERFORMANCE_ISSUES } from "@/domain/admin/data-quality-rules";
import { requireAdmin } from "@/server/auth/auth";
import { getDb } from "@/server/db/client";
import { auditLogs, productModels, supplierListings, systemLogs } from "@/server/db/schema";
import { getDataQualityCounts } from "../data-quality/queries";
import { getSellableSnapshot } from "../sellable";

/**
 * Töölaua mõõdikud — kõik arvutatakse andmebaasist. Kataloogi ja andmekvaliteedi numbrid räägivad vaikimisi
 * MÜÜGIS olevast (poes nähtav — sama reegel mis pood, vt sellable.ts); hinnad on kliendihinnad täiseurodes nagu poes.
 * Käivet ega müügistatistikat ei näidata enne päris makseid.
 */
export async function getDashboard() {
  await requireAdmin();
  const db = getDb();
  const [snapshot, quality, [modelTotal], [listingTotal], [featured], [errors24h], recent] = await Promise.all([
    getSellableSnapshot(),
    getDataQualityCounts("sellable"),
    db.select({ n: count() }).from(productModels),
    db.select({ n: count() }).from(supplierListings),
    db.select({ n: count() }).from(productModels).where(eq(productModels.featured, true)),
    db.select({ n: count() }).from(systemLogs).where(and(eq(systemLogs.level, "ERROR"), gte(systemLogs.createdAt, new Date(Date.now() - 86_400_000)))),
    // Sisselogimised on tegevuslogis olemas, aga töölaual müra
    db.select().from(auditLogs).where(notLike(auditLogs.action, "auth.%")).orderBy(desc(auditLogs.createdAt), desc(auditLogs.id)).limit(6),
  ]);

  const issue = (key: string) => [...quality.models, ...quality.listings].find((item) => item.key === key)?.count ?? 0;
  // Kiirusindeksi puudumine on eraldi kaardil (ei takista müüki) — "suurimad probleemid" näitab andmevigu
  const issues = [...quality.models, ...quality.listings].filter((i) => i.count > 0 && !(PERFORMANCE_ISSUES as readonly string[]).includes(i.key)).sort((a, b) => b.count - a.count);
  const prices = snapshot.customerPrices;

  return {
    sellable: {
      listings: snapshot.listingIds.length,
      bySupplier: snapshot.bySupplier,
      models: snapshot.modelIds.length,
      noImages: issue("no-images"),
      fewImages: issue("few-images"),
      unknownKeyboard: issue("unknown-keyboard"),
      missingCpuBenchmark: issue("missing-cpu-benchmark"),
      missingGpuBenchmark: issue("missing-gpu-benchmark"),
      // Sama skoop mis Andmekvaliteet (varem loeti icecat_metadata üle kõigi mudelite)
      icecatReview: issue("icecat-needs-review"),
      icecatNotFound: issue("icecat-not-found"),
    },
    database: { models: modelTotal.n, listings: listingTotal.n, featured: featured.n },
    prices: prices.length
      ? { min: Math.min(...prices), max: Math.max(...prices), avg: Math.round(prices.reduce((a, b) => a + b, 0) / prices.length / 100) * 100 }
      : { min: null, max: null, avg: null },
    quality: { totalIssues: issues.reduce((sum, i) => sum + i.count, 0), top: issues.slice(0, 5) },
    system: { errors24h: errors24h.n },
    recent,
  };
}

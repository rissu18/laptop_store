import { readFile } from "node:fs/promises";
import path from "node:path";
import { eq, isNull } from "drizzle-orm";
import type { Database } from "@/server/db/client";
import { listingImages, productImages } from "@/server/db/schema";
import { mapWithConcurrency } from "@/server/concurrency/map-with-concurrency";
import { HttpRequestError, fetchWithRetry } from "@/server/http/fetch-with-retry";
import { analyzeImage } from "./image-processor";

/**
 * Pildianalüüs mudeli koondgalerii jaoks (OFFLINE — CLI `npm run images:analyze`, ka `enrich:catalog --images` alguses).
 * Iga analüüsimata pildi kohta (`analyzed_at IS NULL`): laeb keskmise variandi (meie fail `public/` alt või tarnija
 * kaug-URL), arvutab visuaalse räsi ja kvaliteedi (OK / BLANK) ning salvestab andmebaasi. Pood loeb ainult tulemust.
 *
 *   HTTP 404 / 410 või mitte-pildifail → BROKEN (galerii ei näita kunagi)
 *   ajutine viga (võrk, 5xx, aegumine) → jääb analüüsimata, proovitakse järgmisel käivitusel
 *
 * Laptopid.ee sync lisab pilte `onConflictDoNothing` — olemasoleva pildi URL ei muutu, seega tulemus jääb kehtima.
 */

export interface ImageAnalysisReport {
  analyzed: number;
  ok: number;
  blank: number;
  broken: number;
  skipped: number;
  blankExamples: string[];
  brokenExamples: string[];
}

export interface ImageAnalysisOptions {
  /** Analüüsi uuesti ka juba analüüsitud pildid */
  force?: boolean;
  limit?: number;
  concurrency?: number;
  log?: (message: string) => void;
  /** Testides: pildi laadimine (vaikimisi kaug-URL fetch / kohalik fail public/ alt) */
  load?: (url: string) => Promise<Buffer>;
  publicDir?: string;
}

class BrokenImageError extends Error {}

async function defaultLoad(url: string, publicDir: string): Promise<Buffer> {
  if (url.startsWith("/")) {
    const file = path.join(publicDir, ...url.split("/").filter(Boolean));
    if (!file.startsWith(publicDir)) throw new BrokenImageError("Lubamatu failitee");
    return readFile(file).catch(() => {
      throw new BrokenImageError("Faili pole");
    });
  }
  try {
    const response = await fetchWithRetry(url, {}, { timeoutMs: 20_000, maxRetries: 2, baseDelayMs: 800 });
    if (response.status === 404 || response.status === 410) throw new BrokenImageError(`HTTP ${response.status}`);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return Buffer.from(await response.arrayBuffer());
  } catch (error) {
    if (error instanceof HttpRequestError && /\b(404|410)\b/.test(error.message)) throw new BrokenImageError(error.message);
    throw error;
  }
}

export async function analyzeCatalogImages(db: Database, options: ImageAnalysisOptions = {}): Promise<ImageAnalysisReport> {
  const log = options.log ?? (() => {});
  const publicDir = options.publicDir ?? path.join(process.cwd(), "public");
  const load = options.load ?? ((url: string) => defaultLoad(url, publicDir));
  const report: ImageAnalysisReport = { analyzed: 0, ok: 0, blank: 0, broken: 0, skipped: 0, blankExamples: [], brokenExamples: [] };

  const listingRows = await db
    .select({ id: listingImages.id, url: listingImages.mediumUrl })
    .from(listingImages)
    .where(options.force ? undefined : isNull(listingImages.analyzedAt));
  const modelRows = await db
    .select({ id: productImages.id, url: productImages.mediumPath })
    .from(productImages)
    .where(options.force ? undefined : isNull(productImages.analyzedAt));
  let work = [...listingRows.map((r) => ({ ...r, table: "listing" as const })), ...modelRows.map((r) => ({ ...r, table: "model" as const }))];
  if (options.limit) work = work.slice(0, options.limit);
  log(`Pildianalüüs: ${work.length} pilti (pakkumiste ${listingRows.length}, mudelite ${modelRows.length})`);

  await mapWithConcurrency(work, options.concurrency ?? 6, async (row) => {
    let result: { visualHash: string | null; imageQuality: "OK" | "BLANK" | "BROKEN" };
    try {
      const analysis = await analyzeImage(await load(row.url));
      result = { visualHash: analysis.visualHash, imageQuality: analysis.quality };
    } catch (error) {
      const broken = error instanceof BrokenImageError || /unsupported image format|Input buffer/i.test(String(error));
      if (!broken) {
        report.skipped++;
        log(`Pilt jäi analüüsimata (ajutine viga): ${row.url} — ${error instanceof Error ? error.message : String(error)}`);
        return;
      }
      result = { visualHash: null, imageQuality: "BROKEN" };
    }
    const values = { ...result, analyzedAt: new Date() };
    if (row.table === "listing") await db.update(listingImages).set(values).where(eq(listingImages.id, row.id));
    else await db.update(productImages).set(values).where(eq(productImages.id, row.id));
    report.analyzed++;
    if (result.imageQuality === "OK") report.ok++;
    else if (result.imageQuality === "BLANK") {
      report.blank++;
      if (report.blankExamples.length < 30) report.blankExamples.push(row.url);
    } else {
      report.broken++;
      if (report.brokenExamples.length < 30) report.brokenExamples.push(row.url);
    }
  });
  return report;
}

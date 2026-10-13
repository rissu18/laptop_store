/**
 * Pildianalüüs mudeli koondgalerii jaoks (visuaalne räsi + tühja/katkise pildi tuvastus), tulemus andmebaasi:
 *
 *   npm run images:analyze               ainult analüüsimata pildid (uued Laptopid.ee fotod, uued Icecati pildid)
 *   npm run images:analyze -- --force    kõik pildid uuesti
 *   lisaks: --limit N
 *
 * Offline töö — pood loeb ainult tulemust (domain/images/model-gallery.ts). Ka `enrich:catalog --images` käivitab selle.
 */
import "./lib/load-env";
import { createDb } from "@/server/db/client";
import { redactConnectionStrings, resolveDatabaseUrl } from "@/server/db/database-url";
import { analyzeCatalogImages } from "@/server/images/image-analysis";

async function main() {
  const url = resolveDatabaseUrl("direct");
  if (!url) throw new Error("DATABASE_URL puudub");
  const args = process.argv.slice(2);
  const limitArg = args.indexOf("--limit");
  const { db, pool } = createDb(url);
  try {
    const report = await analyzeCatalogImages(db, {
      force: args.includes("--force"),
      limit: limitArg >= 0 ? Number(args[limitArg + 1]) || undefined : undefined,
      log: (m) => console.log(`  ${m}`),
    });
    console.log(`Analüüsitud ${report.analyzed}: OK ${report.ok}, peaaegu tühi (BLANK) ${report.blank}, katkine (BROKEN) ${report.broken}; ajutise veaga vahele ${report.skipped}`);
    for (const u of report.blankExamples) console.log(`    BLANK  ${u}`);
    for (const u of report.brokenExamples) console.log(`    BROKEN ${u}`);
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  console.error("VIGA:", redactConnectionStrings(error instanceof Error ? error.message : String(error)));
  process.exitCode = 1;
});

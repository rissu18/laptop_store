/**
 * Kataloogi rikastus (LOCAL-FIRST: meie andmebaas → Laptopid.ee andmed → Icecat), tulemus meie andmebaasi:
 *
 *   npm run enrich:catalog -- --dry-run              kõik sammud ainult lugedes (mida muudetaks), Icecati päringuid ei tehta
 *   npm run enrich:catalog                           pildid (Laptopid.ee) + tehnilised andmed (GPU, resolutsioon)
 *   npm run enrich:catalog -- --images               ainult pildid
 *   npm run enrich:catalog -- --specs                ainult tehnilised andmed
 *   npm run enrich:catalog -- --images --icecat      + Icecat viimase allikana (ainult vasteta + müügis + GTIN/MPN-iga
 *                                                    mudelid; pildid laaditakse public/media/products alla → commit'i need)
 *   lisaks: --json (täisraport JSON-ina)
 *
 * Idempotentne ja taaskäivitatav: muutmata andmeid üle ei kirjutata, admini parandusi ega peidetud pilte ei puututa.
 * CPU põlvkonna täidab tarnija sync (keskne parser); siin on see ainult aruandes.
 * NB: käsurida ei tühjenda deploy'tud poe vahemälu — tootmises kasuta admin → Andmekvaliteet → "Rikasta kataloogi"
 * (sama teenus + updateTag) või oota järgmist sync'i, mis andmeid muudab.
 */
import "./lib/load-env";
import { createIcecatClientFromEnv } from "@/integrations/icecat/icecat-client";
import { createDb } from "@/server/db/client";
import { redactConnectionStrings, resolveDatabaseUrl } from "@/server/db/database-url";
import { DbImageRepository } from "@/server/images/db-image-repository";
import { LocalImageStorageAdapter } from "@/server/images/storage/local-image-storage";
import { runCatalogEnrichment } from "@/server/enrichment/catalog-enrichment";
import { writeSystemLog } from "@/server/logging/system-log";

async function main() {
  const url = resolveDatabaseUrl("direct");
  if (!url) throw new Error("DATABASE_URL puudub");
  const args = process.argv.slice(2);
  const dryRun = args.includes("--dry-run");
  const onlyImages = args.includes("--images");
  const onlySpecs = args.includes("--specs");
  const images = onlyImages || !onlySpecs;
  const specs = onlySpecs || !onlyImages;
  const { db, pool } = createDb(url);
  try {
    let icecat = null;
    if (args.includes("--icecat") && images) {
      const client = createIcecatClientFromEnv();
      if (!client) throw new Error("ICECAT_USERNAME puudub (.env.local)");
      icecat = { icecat: client, storage: new LocalImageStorageAdapter(), repository: new DbImageRepository(db) };
    }
    const report = await runCatalogEnrichment(db, { images, specs, icecat, dryRun, log: (m) => console.log(`  ${m}`) });
    if (args.includes("--json")) {
      console.log(JSON.stringify(report, null, 2));
    } else {
      const { images: img, specs: sp } = report;
      console.log(dryRun ? "KUIVKÄIVITUS — andmebaasi ei muudetud" : "Rikastus tehtud");
      if (img) {
        console.log(`Pildid: mudeleid ${img.models}; poes nähtava pildiga enne ${img.before.withImages}, pärast ${img.after.withImages}; ilma ${img.before.withoutImages} → ${img.after.withoutImages}`);
        console.log(`  otsused: ${JSON.stringify(img.status)}`);
        console.log(`  Laptopid.ee: sama mudel ${img.linkedLaptopidSameModel}, vaste teise mudeliga ${img.linkedLaptopidMatched}; ülevaatus ${img.review}; vasteta ${img.unresolved}`);
        console.log(`  Icecat: proovitud ${img.icecatAttempted}, leitud ${img.icecatMatched}, identifikaatorita vahele ${img.icecatSkippedNoIdentifiers}`);
        for (const e of img.examples.filter((x) => x.matchedModel)) console.log(`    vaste: ${e.model} → ${e.matchedModel} (${e.matchedBy}, ${e.images} pilti)`);
        for (const r of img.reviewExamples.slice(0, 30)) console.log(`    ülevaatus: ${r.model} ? ${r.candidates.join(", ")} (${r.matchedBy})`);
        for (const r of img.icecatResults) console.log(`    icecat: ${r.model} → ${r.status} ${r.matchedBy ?? ""} ${r.images} pilti ${r.title ?? ""}`);
      }
      if (sp) {
        console.log(`Tehnilised andmed: pakkumisi ${sp.listings}; GPU rikastatud Laptopid.ee ${sp.gpuEnriched.laptopid} / meie andmed ${sp.gpuEnriched.local}; "Integreeritud" jääb ${sp.gpuStillGeneric}; resolutsioon ${sp.resolutionEnriched}; muutunud ridu ${sp.changedListings}`);
        console.log(`  CPU põlvkond puudub ${sp.cpuGenerationMissing} (neist parser tuletab ${sp.cpuGenerationParsable} — täidab järgmine tarnija sync)`);
        for (const e of sp.examples) console.log(`    ${e.sku}: ${e.cpu} → ${e.gpu} (${e.source})`);
      }
    }
    if (!dryRun) {
      await writeSystemLog({
        level: "INFO",
        source: "APPLICATION",
        message: "Kataloogi rikastus (CLI)",
        details: { images: report.images && { status: report.images.status, after: report.images.after, icecatMatched: report.images.icecatMatched }, specs: report.specs && { gpu: report.specs.gpuEnriched, resolution: report.specs.resolutionEnriched, changed: report.specs.changedListings } },
      });
    }
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  console.error("VIGA:", redactConnectionStrings(error instanceof Error ? error.message : String(error)));
  process.exitCode = 1;
});

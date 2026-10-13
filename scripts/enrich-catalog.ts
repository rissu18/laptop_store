/**
 * Kataloogi rikastus (LOCAL-FIRST: meie andmebaas → Laptopid.ee andmed → Icecat), tulemus meie andmebaasi:
 *
 *   npm run enrich:catalog -- --dry-run              kõik sammud ainult lugedes (mida muudetaks), Icecati päringuid ei tehta
 *   npm run enrich:catalog                           pildid (Laptopid.ee) + tehnilised andmed (GPU, resolutsioon)
 *   npm run enrich:catalog -- --images               ainult pildid
 *   npm run enrich:catalog -- --specs                ainult tehnilised andmed
 *   npm run enrich:catalog -- --images --icecat      + Icecat viimase allikana: müügis mudelid, mille galeriis < 5 pilti;
 *                                                    GTIN/MPN või tootja + mudeli identiteet Open Icecati indeksist
 *                                                    (ICECAT_USERNAME + ICECAT_PASSWORD; max 10 pilti mudeli kohta;
 *                                                    pildid laaditakse public/media/products alla → commit'i need)
 *   npm run enrich:catalog -- --images --icecat --dry-run   indeks + Icecati andmelehed (pealkirja kontroll), ilma
 *                                                    allalaadimise ja andmebaasi kirjutamiseta
 *   lisaks: --limit N (ainult N esimest Icecati kandidaati), --report fail.json (täisraport faili)
 *   lisaks: --json (täisraport JSON-ina)
 *
 * Idempotentne ja taaskäivitatav: muutmata andmeid üle ei kirjutata, admini parandusi ega peidetud pilte ei puututa.
 * CPU põlvkonna täidab tarnija sync (keskne parser); siin on see ainult aruandes.
 * NB: käsurida ei tühjenda deploy'tud poe vahemälu — tootmises kasuta admin → Andmekvaliteet → "Rikasta kataloogi"
 * (sama teenus + updateTag) või oota järgmist sync'i, mis andmeid muudab.
 */
import "./lib/load-env";
import { writeFile } from "node:fs/promises";
import { createIcecatClientFromEnv } from "@/integrations/icecat/icecat-client";
import { icecatIndexConfigFromEnv, streamIcecatIndex } from "@/integrations/icecat/icecat-index";
import { createDb } from "@/server/db/client";
import { redactConnectionStrings, resolveDatabaseUrl } from "@/server/db/database-url";
import { DbImageRepository } from "@/server/images/db-image-repository";
import { analyzeCatalogImages } from "@/server/images/image-analysis";
import { LocalImageStorageAdapter } from "@/server/images/storage/local-image-storage";
import { runCatalogEnrichment, type GalleryBuckets, type IcecatIndexSource } from "@/server/enrichment/catalog-enrichment";
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
    let icecatIndex: IcecatIndexSource | null = null;
    if (args.includes("--icecat") && images) {
      const client = createIcecatClientFromEnv();
      if (!client) throw new Error("ICECAT_USERNAME puudub (.env.local)");
      icecat = { icecat: client, storage: new LocalImageStorageAdapter(), repository: new DbImageRepository(db) };
      const indexConfig = icecatIndexConfigFromEnv();
      if (indexConfig) icecatIndex = (supplierIds, onRow) => streamIcecatIndex(indexConfig, supplierIds, onRow);
      else console.log("  ICECAT_PASSWORD puudub — mudelinime järgi ei otsita (ainult GTIN/MPN)");
    }
    const limitArg = args.indexOf("--limit");
    const icecatLimit = limitArg >= 0 ? Number(args[limitArg + 1]) || undefined : undefined;
    const report = await runCatalogEnrichment(db, { images, specs, icecat, icecatIndex, icecatLimit, dryRun, log: (m) => console.log(`  ${m}`) });
    if (images && !dryRun) {
      // Uued pildid (Laptopid.ee sync, Icecat) → visuaalne räsi + tühja/katkise pildi tuvastus mudeli koondgalerii jaoks
      const analysis = await analyzeCatalogImages(db, { log: (m) => console.log(`  ${m}`) });
      console.log(`  Pildianalüüs: ${analysis.analyzed} (BLANK ${analysis.blank}, BROKEN ${analysis.broken}, vahele ${analysis.skipped})`);
    }
    const reportArg = args.indexOf("--report");
    if (reportArg >= 0 && args[reportArg + 1]) await writeFile(args[reportArg + 1], JSON.stringify(report, null, 2));
    if (args.includes("--json")) {
      console.log(JSON.stringify(report, null, 2));
    } else {
      const { images: img, specs: sp } = report;
      console.log(dryRun ? "KUIVKÄIVITUS — andmebaasi ei muudetud" : "Rikastus tehtud");
      if (img) {
        console.log(`Pildid: mudeleid ${img.models}; poes nähtava pildiga enne ${img.before.withImages}, pärast ${img.after.withImages}; ilma ${img.before.withoutImages} → ${img.after.withoutImages}`);
        console.log(`  otsused: ${JSON.stringify(img.status)}`);
        console.log(`  Laptopid.ee: sama mudel ${img.linkedLaptopidSameModel}, vaste teise mudeliga ${img.linkedLaptopidMatched}; ülevaatus ${img.review}; vasteta ${img.unresolved}`);
        for (const e of img.examples.filter((x) => x.matchedModel)) console.log(`    vaste: ${e.model} → ${e.matchedModel} (${e.matchedBy}, ${e.images} pilti)`);
        for (const r of img.reviewExamples.slice(0, 30)) console.log(`    ülevaatus: ${r.model} ? ${r.candidates.join(", ")} (${r.matchedBy})`);
        const b = (g: GalleryBuckets) => `0: ${g.zero}, 1–4: ${g.oneToFour}, 5–10: ${g.fiveToTen}, 10+: ${g.overTen}`;
        console.log(`  Galerii (mudelipildid) enne ${b(img.galleryBefore)} → pärast ${b(img.galleryAfter)}`);
        const ic = img.icecat;
        if (ic) {
          if (ic.index) console.log(`  Icecati indeks: ${ic.index.products} toodet, meie tootjate sülearvuteid ${ic.index.kept} (ei salvestatud)`);
          console.log(`  Icecat: kandidaate ${ic.candidates}; GTIN/MPN ${ic.identifierMatches}; mudelinimi täpne ${ic.nameExact}, number + pealkirja seeria ${ic.nameFamily}; varasem vaste ${ic.reused}`);
          console.log(`          ülevaatus ${ic.review} (Apple ${ic.apple}); vasteta ${ic.unresolved} (tootja Icecatis puudub ${ic.unsupportedBrand}); admin lükkas tagasi ${ic.rejectedByAdmin}; vigu ${ic.errors}`);
          console.log(`          JSON-päringuid ${ic.jsonRequests}; pilte ${dryRun ? "eeldatavalt" : "kokku"} ${ic.imagesExpected}; alla laetud ${ic.downloaded}; duplikaate välja ${ic.duplicates}`);
          for (const r of ic.results) {
            console.log(`    ${r.outcome.padEnd(13)} ${r.model} (${r.imagesBefore} → +${r.icecatImages}) ${r.icecatName ? `"${r.icecatName}" ` : ""}${r.icecatTitle ? `| ${r.icecatTitle.slice(0, 90)} ` : ""}${r.reason && !r.icecatName ? `| ${r.reason}` : ""}`);
          }
        }
      }
      if (sp) {
        console.log(`Tehnilised andmed: pakkumisi ${sp.listings}; GPU rikastatud Laptopid.ee ${sp.gpuEnriched.laptopid} / meie andmed ${sp.gpuEnriched.local}; "Integreeritud" jääb ${sp.gpuStillGeneric}; resolutsioon ${sp.resolutionEnriched}; muutunud ridu ${sp.changedListings}`);
        console.log(`  CPU põlvkond puudub ${sp.cpuGenerationMissing} (neist parser tuletab ${sp.cpuGenerationParsable} — täidab järgmine tarnija sync)`);
        for (const e of sp.examples) console.log(`    ${e.sku}: ${e.cpu} → ${e.gpu} (${e.source})`);
        const pf = sp.performance;
        console.log(`Kiirusindeks / maks. sagedus: Laptopid.ee täpseid võtmeid CPU ${pf.sourceKeys.cpuBenchmark}, GPU ${pf.sourceKeys.gpuBenchmark}, GHz ${pf.sourceKeys.cpuMaxMhz}; konflikte ${pf.conflicts.length}`);
        for (const [field, c] of Object.entries(pf.onSale)) console.log(`  müügis ${field}: otse ${c.direct}, täpne vaste ${c.matched}, puudub ${c.missing}`);
        const u = pf.uniqueOnSale;
        console.log(`  unikaalsed müügis: CPU ${u.cpus} (benchmark ${u.cpusWithBenchmark}, GHz ${u.cpusWithMaxMhz}); GPU ${u.gpus} (benchmark ${u.gpusWithBenchmark})`);
        for (const c of pf.conflicts) console.log(`  KONFLIKT ${c.kind} ${c.key}: ${c.values.join(" / ")} (${c.labels.join("; ")})`);
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

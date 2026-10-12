/**
 * Tech hinnakiri → PostgreSQL käsurealt:
 *   npm run tech:sync -- --dry-run            kuivkäivitus: loeb live XLSX-i ja andmebaasi, EI KIRJUTA midagi
 *   npm run tech:sync                         päris sync (sama teenus mis admini "Sync now" ja cron)
 *   npm run tech:sync -- --allow-large-drop   teadlik suur muutus (palju seadmeid müüdi/kadus korraga)
 *   --file <tee.xlsx>                         kohalik XLSX (ainult --dry-run)
 *
 * Raport ei sisalda seerianumbreid. NB: käsurida ei saa tühjendada deploy'tud poe vahemälu — pärast CLI sync'i
 * vajuta adminis "Sync now" või tee deploy.
 */
import "./lib/load-env";
import { readFileSync } from "node:fs";
import { fetchTechWorkbook } from "@/integrations/tech/tech-client";
import { techPurchasePriceCents, techSalePriceCents } from "@/integrations/tech/tech-normalizer";
import { readTechWorkbook } from "@/integrations/tech/tech-workbook";
import { describeTechError, planTechSync, runTechSync, sampleDetails, snapshotFromSheets } from "@/server/catalog-sync/tech-sync";
import { createDb } from "@/server/db/client";
import { redactConnectionStrings, resolveDatabaseUrl } from "@/server/db/database-url";
import { writeSystemLog } from "@/server/logging/system-log";

const eur = (cents: number) => `${(cents / 100).toFixed(cents % 100 ? 2 : 0)} €`;

async function loadSheets() {
  const fileIndex = process.argv.indexOf("--file");
  if (fileIndex !== -1) return readTechWorkbook(readFileSync(process.argv[fileIndex + 1]));
  const download = await fetchTechWorkbook();
  console.log(`XLSX: ${download.bytes} baiti, ${download.durationMs} ms`);
  return readTechWorkbook(download.data);
}

async function main() {
  const url = resolveDatabaseUrl("direct");
  if (!url) throw new Error("DATABASE_URL puudub");
  const dryRun = process.argv.includes("--dry-run");
  const allowLargeDrop = process.argv.includes("--allow-large-drop");
  if (!dryRun && process.argv.includes("--file")) throw new Error("--file on lubatud ainult koos --dry-run");
  const { db, pool } = createDb(url);
  try {
    if (!dryRun) {
      const result = await runTechSync(db, {
        trigger: "CLI",
        triggeredBy: "cli",
        allowLargeDrop,
        loadSheets,
        log: (entry) => writeSystemLog({ ...entry, source: "TECH" }),
      });
      if (result.status === "BUSY") return console.log("Sync juba käib — proovi hiljem uuesti.");
      if (result.status === "FAILED") {
        console.error(`VIGA: ${result.error}`);
        process.exitCode = 1;
        return;
      }
      console.log(JSON.stringify({ status: result.status, snapshotTrusted: result.snapshotTrusted, trustReason: result.trustReason, changed: result.changed, ...result.stats }, null, 2));
      return;
    }

    // --- DRY RUN: ainult lugemine ---
    const sheets = await loadSheets();
    const snapshot = snapshotFromSheets(sheets);
    let plan;
    try {
      // Enne migratsiooni 0004 seadmete tabelit pole — kuivkäivitus töötab ka siis (eelmist seisu pole)
      const { rows } = await pool.query("SELECT to_regclass('supplier_inventory_units') IS NULL AS missing");
      const unitsTableMissing = rows[0]?.missing === true;
      if (unitsTableMissing) console.log("NB: supplier_inventory_units tabelit veel pole (migratsioon 0004 rakendamata) — eelmist Tech seisu ei ole.");
      plan = await planTechSync(db, snapshot, { now: new Date(), allowLargeDrop, unitsTableMissing });
    } catch (error) {
      console.error(`SNAPSHOT EI LÄBINUD KONTROLLI: ${describeTechError(error)}`);
      console.log(JSON.stringify(snapshot.counts, null, 2));
      process.exitCode = 1;
      return;
    }
    const samples = sampleDetails(plan);
    console.log(`\n=== Töövihik: ${sheets.length} tabi ===`);
    for (const s of samples.sheetReport) {
      const sections = s.sections.map((x) => `${x.title}${x.imported ? " [IMPORT]" : ""} (${x.fromRow}–${x.toRow ?? "lõpp"})`).join(", ");
      console.log(`  "${s.name}" → ${s.role}${s.laptopRows ? `, sülearvuti ridu ${s.laptopRows}` : ""}${sections ? `; sektsioonid: ${sections}` : ""}${s.layoutError ? ` ⚠ ${s.layoutError}` : ""}${s.warning ? ` ⚠ ${s.warning}` : ""}`);
    }
    const c = snapshot.counts;
    console.log(`\n=== Read ===`);
    console.log(JSON.stringify({
      rawLaptopRows: c.laptopRows,
      coloredSold: c.soldRows,
      notLaptop: c.notLaptopRows,
      defect: c.defectRows,
      unknownNote: c.unknownNoteRows,
      invalid: c.invalidRows,
      invalidOrMissingId: c.missingIdRows,
      invalidOrMissingSerial: c.missingSerialRows,
      invalidPrice: c.invalidPriceRows,
      physicalUnitsWithId: c.physicalUnits,
      duplicateIdRowsMerged: c.duplicateRowsMerged,
      conflictingIds: c.conflicts,
      serialDuplicates: c.serialDuplicates,
      validPhysicalUnits: c.validUnits,
      configurationGroups: c.groups,
    }, null, 2));
    const distribution = new Map<number, number>();
    for (const g of snapshot.groups) distribution.set(g.unitIds.length, (distribution.get(g.unitIds.length) ?? 0) + 1);
    console.log(`\nLaoseisu jaotus (laoseis → pakkumisi): ${[...distribution].sort((a, b) => a[0] - b[0]).map(([k, v]) => `${k}→${v}`).join(", ")}`);
    console.log(`\n=== Mudelid ===`);
    console.log(`  olemasoleva ProductModeliga täpne vaste: ${plan.stats.modelsReused}; uusi mudeleid: ${plan.stats.modelsCreated}`);
    console.log(`  rikastus: olemasolev (pildid/andmed) ${plan.stats.enrichmentExisting}, Icecat ${plan.stats.enrichmentIcecat}, puudub (vajaks Icecati / illustratsioon) ${plan.stats.enrichmentMissing}`);
    console.log(`  taksonoomia hoiatused (tundmatu seeria): ${plan.stats.taxonomyWarnings}`);
    console.log(`  rikastuseta: ${samples.enrichmentMissingSample.map((m) => `${m.title}${m.reused ? " (olemas)" : ""}`).join("; ")}`);
    console.log(`\n=== Plaan (andmebaasi EI kirjutatud) ===`);
    console.log(JSON.stringify({ trusted: plan.trusted, trustReason: plan.trustReason, listingsCreate: plan.stats.created, listingsUpdate: plan.stats.updated, listingsUnchanged: plan.stats.unchanged, listingsUnavailable: plan.stats.madeUnavailable, unitsCreate: plan.stats.unitsCreated, unitsUpdate: plan.stats.unitsUpdated, unitsUnchanged: plan.stats.unitsUnchanged, unitsMissing: plan.stats.unitsMissing }, null, 2));
    console.log(`\n=== Näidisgrupid (10) ===`);
    const sample = [...snapshot.groups].sort((a, b) => b.unitIds.length - a.unitIds.length || a.externalId.localeCompare(b.externalId)).slice(0, 10);
    for (const g of sample) {
      const x = g.config;
      const flags = [x.features.backlit && "bl", x.features.smartcard && "id", x.features.lte && "4g", x.features.fiveG && "5g", x.touchscreen && "touch"].filter(Boolean).join(" ") || "–";
      console.log(
        `  ${x.model.title} | ${x.cpu} | ${x.ramGb} GB | ${x.storageGb} GB ${x.storageType ?? ""} | ${x.screenSizeIn}" ${x.resolution ?? "?"} ${x.panel ?? ""} | ${x.gpu ?? "–"} | ${flags} | M ${eur(x.sourcePriceCents)} → ost ${eur(techPurchasePriceCents(x.sourcePriceCents))}, müük ${eur(techSalePriceCents(x.sourcePriceCents))} | laos ${g.unitIds.length}`,
      );
    }
    const show = (title: string, rows: { row: string; techId: string | null; model: string; reason: string }[]) => {
      console.log(`\n=== ${title} (${rows.length}) ===`);
      for (const r of rows) console.log(`  ${r.row} [${r.techId ?? "–"}] ${r.model} — ${r.reason}`);
    };
    show("Tundmatu märkus", samples.unknownNoteSample);
    show("Defekt", samples.defectSample);
    show("Vigased andmed", samples.invalidSample);
    console.log(`\nEi ole sülearvuti: ${samples.notLaptopSample.length} rida (${[...new Set(samples.notLaptopSample.map((r) => r.model))].join("; ")})`);
    if (samples.conflictSample.length) console.log(`Konfliktid: ${JSON.stringify(samples.conflictSample)}`);
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  console.error("VIGA:", redactConnectionStrings(error instanceof Error ? error.message : String(error)));
  process.exit(1);
});

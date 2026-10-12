/**
 * Foxway API → PostgreSQL käsurealt:
 *   npm run foxway:sync -- --dry-run            kuivkäivitus: loeb live Foxway API-t ja andmebaasi, EI KIRJUTA midagi
 *   npm run foxway:sync                         päris sync (sama teenus mis admini "Sync now" ja cron)
 *   npm run foxway:sync -- --allow-large-drop   teadlik suur muutus (palju SKU-sid kadus korraga)
 *
 * Võtit (FOXWAY_API_KEY) ei kuvata ega logita. NB: käsurida ei saa tühjendada deploy'tud poe vahemälu — pärast CLI
 * sync'i vajuta adminis "Sync now" või oota järgmist ajastatud sync'i.
 */
import "./lib/load-env";
import { fetchFoxwayFeeds } from "@/integrations/foxway/foxway-client";
import { buildFoxwaySnapshot } from "@/integrations/foxway/foxway-snapshot";
import { describeFoxwayError, foxwaySampleDetails, planFoxwaySync, runFoxwaySync } from "@/server/catalog-sync/foxway-sync";
import { createDb } from "@/server/db/client";
import { redactConnectionStrings, resolveDatabaseUrl } from "@/server/db/database-url";
import { writeSystemLog } from "@/server/logging/system-log";

const eur = (cents: number) => `${(cents / 100).toFixed(cents % 100 ? 2 : 0)} €`;

async function loadFeeds() {
  const results = await fetchFoxwayFeeds();
  for (const r of results) console.log(`  ${r.feed.label}: ${r.pricelist.lines.length} rida (${r.bytes} baiti, ${r.durationMs} ms)`);
  return results.map(({ feed, pricelist }) => ({ feed, pricelist }));
}

async function main() {
  const url = resolveDatabaseUrl("direct");
  if (!url) throw new Error("DATABASE_URL puudub");
  const dryRun = process.argv.includes("--dry-run");
  const allowLargeDrop = process.argv.includes("--allow-large-drop");
  const { db, pool } = createDb(url);
  try {
    if (!dryRun) {
      const result = await runFoxwaySync(db, { trigger: "CLI", triggeredBy: "cli", allowLargeDrop, loadFeeds, log: (entry) => writeSystemLog({ ...entry, source: "FOXWAY" }) });
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
    console.log("Foxway feed'id:");
    const snapshot = buildFoxwaySnapshot(await loadFeeds());
    let plan;
    try {
      plan = await planFoxwaySync(db, snapshot, { now: new Date(), allowLargeDrop });
    } catch (error) {
      console.error(`PLAAN EBAÕNNESTUS: ${describeFoxwayError(error)}`);
      process.exitCode = 1;
      return;
    }
    const samples = foxwaySampleDetails(plan);
    const tally = (pick: (o: (typeof snapshot.offers)[number]) => string | null) => {
      const map = new Map<string, number>();
      for (const o of snapshot.offers) map.set(pick(o) ?? "–", (map.get(pick(o) ?? "–") ?? 0) + 1);
      return Object.fromEntries([...map].sort((a, b) => b[1] - a[1]));
    };
    console.log("\n=== Snapshot ===");
    console.log(JSON.stringify({ ...snapshot.counts, trusted: plan.trusted, trustReason: plan.trustReason }, null, 2));
    console.log("\n=== Plaan (andmebaasi EI kirjutatud) ===");
    console.log(JSON.stringify(plan.stats, null, 2));
    console.log("\nSeisukord:", JSON.stringify(tally((o) => o.grade)));
    console.log("Boxed:", JSON.stringify(tally((o) => o.dims.boxed)));
    console.log("Laadija:", JSON.stringify(tally((o) => `${o.charger.profile} ${eur(o.charger.surchargeCents)}`)));
    console.log("Klaviatuur:", JSON.stringify(tally((o) => o.keyboard.code ?? (o.keyboard.missing ? "PUUDUB" : null))));
    console.log("Hold:", JSON.stringify(tally((o) => o.hold)));
    console.log("\nRikked:", JSON.stringify(samples.faultSummary));
    console.log("Tundmatud rikked:", JSON.stringify(samples.unknownFaults));
    console.log("Duplikaadid:", JSON.stringify(samples.duplicateSample));
    console.log("Vigased read:", JSON.stringify(samples.invalidSample));
    console.log("Apple vasted olemasolevatega:", JSON.stringify(samples.appleMatches));
    console.log("\n=== Hinnanäited ===");
    const example = (label: string, pick: (o: (typeof snapshot.offers)[number]) => boolean) => {
      const o = snapshot.offers.find((x) => x.price && pick(x));
      if (!o || !o.price) return console.log(`  ${label}: –`);
      const p = o.price;
      console.log(`  ${label}: ${o.productName} [${o.sku}] ${o.dims.boxed} → ${eur(p.supplierPriceCents)} + KM ${eur(p.vatCents)} + ${eur(p.markupCents)} + laadija ${eur(p.chargerCents)} = ${eur(p.salePriceCents)}`);
    };
    example("tavaline, laadijaga", (o) => o.charger.boxed === "CHARGER_INCLUDED");
    example("originaalkarp", (o) => o.charger.boxed === "ORIGINAL_BOX");
    example("tavaline Unboxed", (o) => o.charger.profile === "STANDARD");
    example("tööjaam Unboxed", (o) => o.charger.profile === "HIGH_POWER");
    console.log(`\nBlokeeritud (${samples.blockedSample.length}):`);
    for (const r of samples.blockedSample.slice(0, 40)) console.log(`  ${r.sku} ${r.productName} — ${r.reasons.join("; ")}`);
    console.log(`\nÜlevaatus (${samples.reviewSample.length}):`);
    for (const r of samples.reviewSample) console.log(`  ${r.sku} ${r.productName} — ${r.reasons.join("; ")}`);
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  console.error("VIGA:", redactConnectionStrings(error instanceof Error ? error.message : String(error)));
  process.exit(1);
});

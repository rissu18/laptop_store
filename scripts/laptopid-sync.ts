/**
 * Laptopid.ee → PostgreSQL sync käsurealt: npm run laptopid:sync [-- --allow-large-drop]
 * Sama teenus mis admini "Sync now" ja ajastatud otspunkt (src/server/catalog-sync/laptopid-sync.ts).
 *
 * NB: käsurida ei saa tühjendada deploy'tud poe vahemälu. Pärast CLI sync'i vajuta adminis "Sync now"
 * (see tühjendab alati kataloogi vahemälu) või tee uus deploy.
 */
import "./lib/load-env";
import { fetchLaptopidRaw } from "@/integrations/laptopid/laptopid-client";
import { createImageSizeProbe } from "@/server/catalog-sync/image-probe";
import { runLaptopidSync } from "@/server/catalog-sync/laptopid-sync";
import { createDb } from "@/server/db/client";
import { redactConnectionStrings, resolveDatabaseUrl } from "@/server/db/database-url";
import { writeSystemLog } from "@/server/logging/system-log";

async function main() {
  const url = resolveDatabaseUrl("direct");
  if (!url) throw new Error("DATABASE_URL puudub");
  const { db, pool } = createDb(url);
  try {
    const result = await runLaptopidSync(db, {
      trigger: "CLI",
      triggeredBy: "cli",
      allowLargeDrop: process.argv.includes("--allow-large-drop"),
      fetchRaw: () => fetchLaptopidRaw(),
      probeImage: createImageSizeProbe(),
      log: (entry) => writeSystemLog({ ...entry, source: "LAPTOPID" }),
    });
    if (result.status === "BUSY") {
      console.log("Sync juba käib — proovi hiljem uuesti.");
      return;
    }
    if (result.status === "FAILED") {
      console.error(`VIGA: ${result.error}`);
      process.exitCode = 1;
      return;
    }
    console.log(JSON.stringify({ status: result.status, snapshotTrusted: result.snapshotTrusted, trustReason: result.trustReason, ...result.stats }, null, 2));
    if (result.rejected.length) {
      console.log(`Vahele jäetud (${result.rejected.length}):`);
      for (const r of result.rejected) console.log(`  ${r.externalId ?? "?"}: ${r.message}`);
    }
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  console.error("VIGA:", redactConnectionStrings(error instanceof Error ? error.message : String(error)));
  process.exit(1);
});

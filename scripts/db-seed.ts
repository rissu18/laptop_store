/**
 * Praeguse kataloogi import PostgreSQL-i: npm run db:seed
 *
 * Allikad: mock-tarnija (src/integrations/supplier/mock), pildikirjed (data/media/product-images.json),
 * Icecati vasted (data/icecat/matches.json), identifikaatorid (data/icecat/model-identifiers.json),
 * hinnareeglid (src/config/pricing.ts). Idempotentne — korduv käivitamine ei tekita duplikaate.
 *
 * Väljastab kontrollraporti: allika arvud ENNE ja andmebaasi arvud PÄRAST.
 */
import "./lib/load-env";
import { createDb } from "@/server/db/client";
import { redactConnectionStrings, resolveDatabaseUrl } from "@/server/db/database-url";
import { countCatalog, seedCatalog } from "@/server/db/seed/seed-catalog";
import { loadSeedSources } from "@/server/db/seed/seed-sources";

async function main() {
  const url = resolveDatabaseUrl("direct");
  if (!url) throw new Error("DATABASE_URL puudub");

  const { sources, before, rejected } = await loadSeedSources();
  console.log("ENNE (allikad):", JSON.stringify(before), rejected.length ? `· tagasi lükatud kirjeid: ${rejected.length}` : "");

  const { db, pool } = createDb(url);
  try {
    console.log("Andmebaas enne:", JSON.stringify(await countCatalog(db)));
    const stats = await seedCatalog(db, sources);
    console.log("PÄRAST (andmebaas):", JSON.stringify({ models: stats.models, listings: stats.listings, images: stats.images, icecat: stats.icecat }), `· identifikaatoreid: ${stats.identifiers}`);
    if (stats.pricingErrors.length) console.warn("Hinnastamise vead:", stats.pricingErrors);

    const icecatOk = Object.entries(before.icecat).every(([status, n]) => stats.icecat[status] === n);
    const ok = stats.models === before.models && stats.listings === before.listings && stats.images === before.images && icecatOk;
    console.log(ok ? "KONTROLL: OK — arvud klapivad" : "KONTROLL: ERINEVUS — vaata üle!");
    if (!ok) process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  console.error("VIGA:", redactConnectionStrings(error instanceof Error ? error.message : String(error)));
  process.exit(1);
});

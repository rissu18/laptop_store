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
import { readFileSync } from "node:fs";
import { pricingConfig } from "@/config/pricing";
import type { IcecatMatchRecord } from "@/domain/images/icecat-match";
import { MockSupplierAdapter } from "@/integrations/supplier/mock/mock-supplier-adapter";
import { MOCK_FEATURED_SKUS } from "@/integrations/supplier/mock/mock-supplier-data";
import { createDb } from "@/server/db/client";
import { redactConnectionStrings, resolveDatabaseUrl } from "@/server/db/database-url";
import { countCatalog, seedCatalog } from "@/server/db/seed/seed-catalog";
import { readImageManifestSync, readMatchesSync } from "@/server/images/image-repository";
import { groupOffersIntoModels } from "@/server/images/product-models";

async function main() {
  const url = resolveDatabaseUrl("direct");
  if (!url) throw new Error("DATABASE_URL puudub");

  const { offers, rejected } = await new MockSupplierAdapter().getProducts();
  const models = groupOffersIntoModels(offers);
  const images = readImageManifestSync();
  const matches: IcecatMatchRecord[] = readMatchesSync();
  const curated = JSON.parse(readFileSync("data/icecat/model-identifiers.json", "utf8")).models;
  const modelSlugs = new Set(models.map((m) => m.model.id));

  const before = {
    models: models.length,
    listings: offers.length,
    images: Object.entries(images).filter(([slug]) => modelSlugs.has(slug)).reduce((sum, [, list]) => sum + list.length, 0),
    icecat: matches
      .filter((m) => modelSlugs.has(m.productModelId))
      .reduce<Record<string, number>>((acc, m) => ({ ...acc, [m.status]: (acc[m.status] ?? 0) + 1 }), {}),
  };
  console.log("ENNE (allikad):", JSON.stringify(before), rejected.length ? `· tagasi lükatud kirjeid: ${rejected.length}` : "");

  const { db, pool } = createDb(url);
  try {
    console.log("Andmebaas enne:", JSON.stringify(await countCatalog(db)));
    const stats = await seedCatalog(db, {
      offers,
      featuredExternalIds: MOCK_FEATURED_SKUS,
      curatedIdentifiers: curated,
      images,
      icecatMatches: matches,
      pricingBands: pricingConfig.bands,
    });
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

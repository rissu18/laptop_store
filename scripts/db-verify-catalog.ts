/**
 * Võrdleb poe kataloogi kahest allikast: mock-tarnija (vana) vs PostgreSQL (uus).
 * npm run db:verify-catalog
 *
 * Kasutatakse ülemineku kontrolliks: sama pakkumiste hulk, samad avalikud ID-d, hinnad, pildid,
 * spetsifikatsioonid. Admini teadlikud muudatused (nt parandatud väärtus) ilmuvad erinevustena.
 */
import "./lib/load-env";
import { pricingConfig } from "@/config/pricing";
import { toImageView, visibleImages } from "@/domain/images/product-image";
import { MockSupplierAdapter } from "@/integrations/supplier/mock/mock-supplier-adapter";
import { MOCK_FEATURED_SKUS } from "@/integrations/supplier/mock/mock-supplier-data";
import { mapCatalogRows } from "@/server/catalog/db-catalog-mapper";
import { buildCatalog } from "@/server/catalog/build-catalog";
import { createDb } from "@/server/db/client";
import { resolveDatabaseUrl, redactConnectionStrings } from "@/server/db/database-url";
import { productImages, productModels, supplierListings } from "@/server/db/schema";
import { readImageManifestSync } from "@/server/images/image-repository";

async function main() {
  const url = resolveDatabaseUrl("direct");
  if (!url) throw new Error("DATABASE_URL puudub");

  const manifest = readImageManifestSync();
  const mock = buildCatalog(await new MockSupplierAdapter().getProducts(), {
    pricing: pricingConfig,
    featuredExternalIds: MOCK_FEATURED_SKUS,
    lastSyncedAt: null,
    modelImages: Object.fromEntries(Object.entries(manifest).map(([id, records]) => [id, visibleImages(records).map(toImageView)])),
  }).items;

  const { db, pool } = createDb(url);
  try {
    const [models, listings, images] = await Promise.all([db.select().from(productModels), db.select().from(supplierListings), db.select().from(productImages)]);
    const { items, incomplete } = mapCatalogRows(models, listings, images);

    const dbById = new Map(items.map((item) => [item.variant.id, item]));
    const differences: string[] = [];
    for (const old of mock) {
      const now = dbById.get(old.variant.id);
      if (!now) {
        differences.push(`${old.variant.id}: puudub andmebaasi kataloogis`);
        continue;
      }
      const checks: [string, unknown, unknown][] = [
        ["toode", old.product.slug, now.product.slug],
        ["hind", old.variant.price.saleCents, now.variant.price.saleCents],
        ["CPU", old.variant.cpu.model, now.variant.cpu.model],
        ["RAM", old.variant.ramGb, now.variant.ramGb],
        ["SSD", old.variant.storageGb, now.variant.storageGb],
        ["seisukord", old.variant.grade, now.variant.grade],
        ["laoseis", old.variant.stock.quantity, now.variant.stock.quantity],
        ["klaviatuur", old.variant.keyboardLayout, now.variant.keyboardLayout],
        ["pilte", old.product.images.length, now.product.images.length],
        ["põhipilt", old.product.images[0]?.mediumUrl ?? null, now.product.images[0]?.mediumUrl ?? null],
      ];
      for (const [label, a, b] of checks) if (a !== b) differences.push(`${old.variant.id}: ${label} ${String(a)} → ${String(b)}`);
    }
    const extra = items.filter((item) => !mock.some((old) => old.variant.id === item.variant.id));
    console.log(`Mock-kataloog: ${mock.length} pakkumist · andmebaasi kataloog: ${items.length} pakkumist · puudulikke: ${incomplete.length} · lisaks andmebaasis: ${extra.length}`);
    console.log(`Esile tõstetud: mock ${mock.filter((i) => i.variant.isFeatured).length} pakkumist · andmebaas ${items.filter((i) => i.variant.isFeatured).length} pakkumist (mudeli tasemel)`);
    if (differences.length) {
      console.log(`ERINEVUSED (${differences.length}):`);
      for (const line of differences) console.log("  " + line);
    } else console.log("KONTROLL: OK — kõik mock-kataloogi pakkumised on andmebaasis samade väärtustega");
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  console.error("VIGA:", redactConnectionStrings(error instanceof Error ? error.message : String(error)));
  process.exitCode = 1;
});

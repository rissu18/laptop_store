import "server-only";
import { asc } from "drizzle-orm";
import type { SearchableItem } from "@/domain/catalog/filtering";
import { getDb } from "@/server/db/client";
import { listingImages, productImages, productModels, supplierListings } from "@/server/db/schema";
import { errorMessage, newErrorId, writeSystemLog } from "@/server/logging/system-log";
import { mapCatalogRows } from "./db-catalog-mapper";

/**
 * Poe kataloog PostgreSQL-ist. Neli lihtsat päringut (mudelid, pakkumised, mudeli pildid, pakkumiste pildid)
 * ja teisendus mälus — kataloog on väike (sajad pakkumised); filtreerimine ja tahud töötavad sama koodiga.
 *
 * Viga EI peideta mock-andmete taha: see logitakse (konsool + system_logs) ja visatakse edasi,
 * et leht näitaks veateadet (error.tsx), mitte valesid tooteid.
 */
export async function loadDbCatalogItems(): Promise<SearchableItem[]> {
  try {
    const db = getDb();
    const [models, listings, images, unitImages] = await Promise.all([
      db.select().from(productModels),
      db.select().from(supplierListings).orderBy(asc(supplierListings.sku)),
      db.select().from(productImages).orderBy(asc(productImages.productModelId), asc(productImages.position)),
      db.select().from(listingImages).orderBy(asc(listingImages.supplierListingId), asc(listingImages.position)),
    ]);
    const { items, incomplete } = mapCatalogRows(models, listings, images, unitImages);
    if (incomplete.length) {
      // Puudulikud pakkumised ei jõua poodi; admin näeb neid Data Quality all
      console.warn(JSON.stringify({ level: "warn", scope: "catalog", message: "Puudulikud pakkumised jäeti poest välja", count: incomplete.length }));
    }
    return items;
  } catch (error) {
    const errorId = newErrorId();
    await writeSystemLog({ level: "ERROR", source: "DATABASE", message: "Kataloogi laadimine andmebaasist ebaõnnestus", details: { reason: errorMessage(error) }, errorId });
    throw new Error(`Kataloogi laadimine ebaõnnestus (viga ${errorId})`);
  }
}

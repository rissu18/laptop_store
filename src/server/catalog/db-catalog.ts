import "server-only";
import { and, asc, eq, getTableColumns, inArray, isNull, or, type Table } from "drizzle-orm";
import type { SearchableItem } from "@/domain/catalog/filtering";
import { getDb, type Database } from "@/server/db/client";
import { listingImages, productImages, productModels, supplierListings } from "@/server/db/schema";
import { errorMessage, newErrorId, writeSystemLog } from "@/server/logging/system-log";
import {
  STOREFRONT_IMAGE_COLUMNS,
  STOREFRONT_LISTING_COLUMNS,
  STOREFRONT_LISTING_IMAGE_COLUMNS,
  STOREFRONT_MODEL_COLUMNS,
  mapCatalogRows,
} from "./db-catalog-mapper";

/**
 * Poe kataloog PostgreSQL-ist. Neli lihtsat päringut (mudelid, pakkumised, mudeli pildid, pakkumiste pildid)
 * ja teisendus mälus — kataloog on väike (sajad pakkumised); filtreerimine ja tahud töötavad sama koodiga.
 *
 * Viga EI peideta mock-andmete taha: see logitakse (konsool + system_logs) ja visatakse edasi,
 * et leht näitaks veateadet (error.tsx), mitte valesid tooteid.
 */
export async function loadDbCatalogItems(): Promise<SearchableItem[]> {
  try {
    const { models, listings, images, unitImages } = await queryStorefrontCatalogRows(getDb());
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

export function pickColumns<T extends Table, K extends keyof T["_"]["columns"] & string>(table: T, keys: readonly K[]): Pick<T["_"]["columns"], K> {
  const all = getTableColumns(table) as T["_"]["columns"];
  return Object.fromEntries(keys.map((key) => [key, all[key]])) as Pick<T["_"]["columns"], K>;
}

/**
 * Poe kataloogi read: ainult mapperi vajatud veerud (ilma `raw_data` jms) ja SQL-is välja jäetud read, mida
 * mapper niikuinii ei näitaks. Filter kasutab ainult välju, mida admin `manual_overrides` kaudu muuta ei saa:
 *   - mudel ja pakkumine `status = 'ACTIVE'`;
 *   - `available IS NOT FALSE` (false = puudus tarnija snapshot'ist). NULL jääb sisse — siis otsustab kogus.
 * Kogus (`stock`) on admini parandatav, seega kogusekontroll ja kohustuslike andmete kontroll jäävad
 * mapperisse (resolveStock / missingStorefrontFields). Peidetud pilte ei laeta.
 *
 * Ainult poe lugemistee — kassa, admin ja sync loevad oma päringutega täisridu.
 */
export async function queryStorefrontCatalogRows(db: Pick<Database, "select">) {
  const activeModelIds = db.select({ id: productModels.id }).from(productModels).where(eq(productModels.status, "ACTIVE"));
  const listingWhere = and(
    eq(supplierListings.status, "ACTIVE"),
    or(isNull(supplierListings.available), eq(supplierListings.available, true)),
    inArray(supplierListings.productModelId, activeModelIds),
  );
  const storefrontListingIds = db.select({ id: supplierListings.id }).from(supplierListings).where(listingWhere);

  const [models, listings, images, unitImages] = await Promise.all([
    db.select(pickColumns(productModels, STOREFRONT_MODEL_COLUMNS)).from(productModels).where(eq(productModels.status, "ACTIVE")),
    db.select(pickColumns(supplierListings, STOREFRONT_LISTING_COLUMNS)).from(supplierListings).where(listingWhere).orderBy(asc(supplierListings.sku)),
    db
      .select(pickColumns(productImages, STOREFRONT_IMAGE_COLUMNS))
      .from(productImages)
      .where(and(eq(productImages.isHidden, false), inArray(productImages.productModelId, activeModelIds)))
      .orderBy(asc(productImages.productModelId), asc(productImages.position)),
    db
      .select(pickColumns(listingImages, STOREFRONT_LISTING_IMAGE_COLUMNS))
      .from(listingImages)
      .where(and(eq(listingImages.isHidden, false), inArray(listingImages.supplierListingId, storefrontListingIds)))
      .orderBy(asc(listingImages.supplierListingId), asc(listingImages.position)),
  ]);
  return { models, listings, images, unitImages };
}

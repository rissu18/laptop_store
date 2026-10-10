import { count } from "drizzle-orm";
import type { IcecatMatchRecord } from "@/domain/images/icecat-match";
import type { ProductImageRecord } from "@/domain/images/product-image";
import { calculatePrice, PricingError, type PricingBand } from "@/domain/pricing/pricing-engine";
import { DEFAULT_SETTINGS, SETTINGS_SCHEMAS, toPricingConfig, type SettingsKey } from "@/domain/settings/settings";
import type { NormalizedOffer } from "@/integrations/supplier/normalized-offer";
import { productFromOffer } from "@/server/catalog/build-catalog";
import type { Database } from "@/server/db/client";
import {
  icecatMetadata,
  pricingRules,
  productIdentifiers,
  productImages,
  productModels,
  storeSettings,
  supplierListings,
} from "@/server/db/schema";

/**
 * Idempotentne import: praegune kataloog (mock-tarnija), pildikirjed, Icecati vasted,
 * identifikaatorid, hinnareeglid ja seaded → PostgreSQL.
 *
 * Idempotentne = sama importi võib käivitada mitu korda; looduslikud võtmed hoiavad ära duplikaadid:
 *   mudel → slug · pakkumine → (tarnija, tarnija toote ID) · pilt → (mudel, allikas, allika ID)
 *
 * Admini väljad (status, featured, description, manual_overrides, müügihind, piltide järjekord/peitmine)
 * seatakse AINULT esmasel lisamisel — korduv import ei kirjuta admini muudatusi üle.
 */

export interface CuratedIdentifiers {
  gtins: string[];
  mpns: string[];
  icecatIds: string[];
  confirmedIcecatId?: string;
  rejectedIcecatIds?: string[];
}

export interface SeedSources {
  offers: NormalizedOffer[];
  featuredExternalIds: string[];
  curatedIdentifiers: Record<string, CuratedIdentifiers>;
  images: Record<string, ProductImageRecord[]>;
  icecatMatches: IcecatMatchRecord[];
  pricingBands: PricingBand[];
}

export interface SeedStats {
  models: number;
  listings: number;
  images: number;
  identifiers: number;
  icecat: Record<string, number>;
  pricingErrors: string[];
}

/** "T14 Gen 3" → "Gen 3", "EliteBook 840 G8" → "G8" */
export function extractGeneration(model: string): string | null {
  return model.match(/\b(Gen \d+|G\d{1,2})\b/i)?.[1] ?? null;
}

/** Avalik pakkumise ID (URL-is ja ostukorvis): püsib sama ka andmebaasi üleminekul. */
export function publicListingId(supplier: string, supplierProductId: string): string {
  return `${supplier}-${supplierProductId}`.toLowerCase();
}

export function ourSku(externalId: string): string {
  return `SP-${externalId.replace(/^\D+-?/, "")}`;
}

export async function seedCatalog(db: Database, sources: SeedSources): Promise<SeedStats> {
  const pricingErrors: string[] = [];

  // 1. Seaded ja hinnareeglid (ainult kui puuduvad)
  for (const key of Object.keys(SETTINGS_SCHEMAS) as SettingsKey[]) {
    await db.insert(storeSettings).values({ key, value: DEFAULT_SETTINGS[key], updatedBy: "seed" }).onConflictDoNothing();
  }
  const [{ value: ruleCount }] = await db.select({ value: count() }).from(pricingRules);
  if (ruleCount === 0) {
    await db.insert(pricingRules).values(
      sources.pricingBands.map((band, position) => ({
        fromCostCents: band.fromCostCents,
        toCostCents: band.toCostCents,
        markupFixedCents: band.markupFixedCents,
        markupPercentBps: band.markupPercentBps,
        position,
      })),
    );
  }
  const pricing = toPricingConfig(DEFAULT_SETTINGS.pricing, sources.pricingBands);

  // 2. Mudelid (üks kord sluggi kohta)
  const modelIdBySlug = new Map<string, string>();
  for (const offer of sources.offers) {
    const product = productFromOffer(offer);
    if (modelIdBySlug.has(product.slug)) continue;
    const featured = sources.offers.some((o) => productFromOffer(o).slug === product.slug && sources.featuredExternalIds.includes(o.externalId));
    const supplierColumns = {
      manufacturer: product.brand,
      family: product.series,
      model: product.model,
      generation: extractGeneration(product.model),
      screenSizeIn: offer.screenSizeIn,
      weightKg: offer.weightKg,
      usbAPorts: offer.usbAPorts,
      usbCPorts: offer.usbCPorts,
      wifi: offer.wifi,
      bluetooth: offer.bluetooth,
    };
    const [row] = await db
      .insert(productModels)
      .values({ slug: product.slug, ...supplierColumns, featured })
      .onConflictDoUpdate({ target: productModels.slug, set: supplierColumns })
      .returning({ id: productModels.id });
    modelIdBySlug.set(product.slug, row.id);
  }

  // 3. Pakkumised
  for (const offer of sources.offers) {
    const modelId = modelIdBySlug.get(productFromOffer(offer).slug)!;
    let salePriceCents: number | null = null;
    try {
      salePriceCents = calculatePrice(pricing, { costCents: offer.costCents, vatScheme: offer.vatScheme }).saleCents;
    } catch (error) {
      if (!(error instanceof PricingError)) throw error;
      pricingErrors.push(`${offer.externalId}: ${error.message}`);
    }
    const supplierColumns = {
      productModelId: modelId,
      supplierSku: offer.externalId,
      cpu: offer.cpuModel,
      cpuFamily: offer.cpuFamily,
      cpuGeneration: offer.cpuGenerationKey,
      ramGb: offer.ramGb,
      ramType: offer.ramType,
      storageGb: offer.storageGb,
      gpu: offer.gpuModel,
      gpuDedicated: offer.gpuDedicated,
      screenSizeIn: offer.screenSizeIn,
      resolution: offer.resolution,
      resolutionLabel: offer.resolutionLabel,
      panel: offer.panel,
      touchscreen: offer.features.touch,
      keyboard: offer.keyboardLayout,
      grade: offer.grade,
      features: offer.features,
      operatingSystem: offer.os,
      warrantyMonths: offer.warrantyMonths,
      batteryHealthPct: offer.batteryHealthPct,
      chargerIncluded: offer.chargerIncluded,
      stock: offer.stockQuantity,
      deliveryMinDays: offer.deliveryDays?.minDays ?? null,
      deliveryMaxDays: offer.deliveryDays?.maxDays ?? null,
      supplierPriceCents: offer.costCents,
      vatScheme: offer.vatScheme,
      firstSeenAt: offer.listedAt ? new Date(offer.listedAt) : new Date(),
    };
    await db
      .insert(supplierListings)
      .values({
        supplier: offer.supplierCode,
        supplierProductId: offer.externalId,
        sku: ourSku(offer.externalId),
        salePriceCents,
        ...supplierColumns,
      })
      // Korduval impordil uuendatakse ainult tarnija välju — müügihind ja admini väljad jäävad
      .onConflictDoUpdate({ target: [supplierListings.supplier, supplierListings.supplierProductId], set: supplierColumns });
  }

  // 4. Identifikaatorid: tarnija (GTIN/MPN pakkumistest) + käsitsi kogutud + admini otsused
  const identifierRows: (typeof productIdentifiers.$inferInsert)[] = [];
  for (const offer of sources.offers) {
    const modelId = modelIdBySlug.get(productFromOffer(offer).slug)!;
    if (offer.gtin) identifierRows.push({ productModelId: modelId, kind: "GTIN", value: offer.gtin, source: "SUPPLIER" });
    if (offer.mpn) identifierRows.push({ productModelId: modelId, kind: "MPN", value: offer.mpn, source: "SUPPLIER" });
  }
  for (const [slug, ids] of Object.entries(sources.curatedIdentifiers)) {
    const modelId = modelIdBySlug.get(slug);
    if (!modelId) continue;
    for (const value of ids.gtins) identifierRows.push({ productModelId: modelId, kind: "GTIN", value, source: "CURATED" });
    for (const value of ids.mpns) identifierRows.push({ productModelId: modelId, kind: "MPN", value, source: "CURATED" });
    for (const value of ids.icecatIds) identifierRows.push({ productModelId: modelId, kind: "ICECAT_ID", value, source: "CURATED" });
    if (ids.confirmedIcecatId) identifierRows.push({ productModelId: modelId, kind: "CONFIRMED_ICECAT_ID", value: ids.confirmedIcecatId, source: "ADMIN" });
    for (const value of ids.rejectedIcecatIds ?? []) identifierRows.push({ productModelId: modelId, kind: "REJECTED_ICECAT_ID", value, source: "ADMIN" });
  }
  if (identifierRows.length) await db.insert(productIdentifiers).values(identifierRows).onConflictDoNothing();

  // 5. Pildid (metaandmed; failid jäävad public/media/products alla)
  for (const [slug, records] of Object.entries(sources.images)) {
    const modelId = modelIdBySlug.get(slug);
    if (!modelId) continue;
    for (const image of records) {
      const fileColumns = {
        thumbnailPath: image.thumbnailUrl,
        mediumPath: image.mediumUrl,
        largePath: image.largeUrl,
        width: image.width,
        height: image.height,
        alt: image.alt,
        type: image.type,
        originalSourceUrl: image.originalSourceUrl,
        sourceUpdatedAt: image.sourceUpdatedAt,
        contentHash: image.contentHash ?? null,
        storageKeys: image.storageKeys,
        downloadedAt: image.downloadedAt ? new Date(image.downloadedAt) : null,
      };
      await db
        .insert(productImages)
        .values({
          productModelId: modelId,
          source: image.source,
          sourceId: image.sourceId,
          position: image.position,
          isMain: image.isMain,
          isHidden: image.isHidden ?? false,
          ...fileColumns,
        })
        // Järjekord, põhipilt ja peitmine on admini otsused — neid korduv import ei muuda
        .onConflictDoUpdate({ target: [productImages.productModelId, productImages.source, productImages.sourceId], set: fileColumns });
    }
  }

  // 6. Icecati vasted
  for (const match of sources.icecatMatches) {
    const modelId = modelIdBySlug.get(match.productModelId);
    if (!modelId) continue;
    const values = {
      status: match.status,
      reason: match.reason ?? null,
      matchType: match.matchType,
      confidence: match.confidence,
      icecatId: match.icecatId,
      icecatTitle: match.icecatTitle,
      matchedBy: match.matchedBy,
      titleVerified: match.titleVerified,
      imageCount: match.imageCount,
      error: match.error,
      checkedAt: new Date(match.checkedAt),
    };
    await db.insert(icecatMetadata).values({ productModelId: modelId, ...values }).onConflictDoUpdate({ target: icecatMetadata.productModelId, set: values });
  }

  return { ...(await countCatalog(db)), pricingErrors };
}

export async function countCatalog(db: Database): Promise<Omit<SeedStats, "pricingErrors">> {
  const [[models], [listings], [images], [identifiers], icecatRows] = await Promise.all([
    db.select({ n: count() }).from(productModels),
    db.select({ n: count() }).from(supplierListings),
    db.select({ n: count() }).from(productImages),
    db.select({ n: count() }).from(productIdentifiers),
    db.select({ status: icecatMetadata.status, n: count() }).from(icecatMetadata).groupBy(icecatMetadata.status),
  ]);
  return {
    models: models.n,
    listings: listings.n,
    images: images.n,
    identifiers: identifiers.n,
    icecat: Object.fromEntries(icecatRows.map((r) => [r.status, r.n])),
  };
}


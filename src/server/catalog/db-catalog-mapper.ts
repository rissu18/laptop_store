import { displayModelName, displayProductTitle } from "@/domain/catalog/display-name";
import { BRAND_CODES, FEATURE_KEYS, type BrandCode, type CatalogItem, type CpuFamily, type FeatureFlags, type VatScheme } from "@/domain/catalog/types";
import { resolveStock } from "@/domain/catalog/availability";
import { effectivePerformance } from "@/domain/catalog/benchmarks";
import { applyListingEnrichment, displayGpu } from "@/domain/catalog/enrichment";
import { buildSearchText } from "@/domain/catalog/search";
import type { SearchableItem } from "@/domain/catalog/filtering";
import { MODEL_OVERRIDABLE_FIELDS, applyOverrides, listingOverridableFields } from "@/domain/catalog/overrides";
import { GRADE_CODES, type GradeCode } from "@/domain/grade/grades";
import { buildModelGallery, groupForListingImage, groupForModelImage, type GalleryCandidate } from "@/domain/images/model-gallery";
import type { ProductImageView } from "@/domain/images/product-image";
import { roundToEuro } from "@/domain/money/money";
import { publicListingId } from "@/server/db/seed/seed-catalog";
import type { listingImages, productImages, productModels, supplierListings } from "@/server/db/schema";

/**
 * Andmebaasi read → poe kataloogi kirjed (CatalogItem).
 * - Kasutab EFEKTIIVSEID väärtusi (admini parandus ?? tarnija väärtus).
 * - Poes näidatakse ainult ACTIVE mudelite ACTIVE pakkumisi, mis on saadaval (vt domain/catalog/availability.ts),
 *   millel pole tarnija kvaliteedi kinnipidamist (`quality_hold` REVIEW/BLOCKED, nt Foxway rike — efektiivne väärtus)
 *   ja millel on kõik poe jaoks kohustuslikud andmed (CPU, RAM, SSD, seisukord, müügihind, ekraan).
 *   Puudulikud pakkumised ei kao andmebaasist — need on adminis Data Quality all parandamiseks.
 * - Puuduvaid väärtusi ei asendata võltsitud vaikeväärtustega.
 * - Pildid: mudeli KOONDGALERII (domain/images/model-gallery.ts) — mudeli pildid (product_images) + sama mudeli kõigi
 *   müügis pakkumiste pildid (listing_images) ühes deterministlikus järjekorras → product.images. Kõik sama mudeli
 *   konfiguratsioonid näitavad sama galeriid (variant.images jääb tühjaks).
 */

/**
 * Veerud, mida see mapper loeb. Poe kataloogipäring (db-catalog.ts) valib andmebaasist AINULT need — tarnija
 * toorandmed (`raw_data`), ostuhind jms jäävad välja. Kui mapper hakkab uut välja lugema, lisa see ka siia.
 * Kassa, admin ja testid võivad anda täisridu (need sobivad nende tüüpidega).
 */
export const STOREFRONT_MODEL_COLUMNS = [
  "id", "slug", "status", "manualOverrides", "featured",
  "manufacturer", "family", "model", "screenSizeIn", "weightKg", "usbAPorts", "usbCPorts", "wifi", "bluetooth",
] as const;
export const STOREFRONT_LISTING_COLUMNS = [
  "id", "productModelId", "supplier", "supplierProductId", "sku", "status", "manualOverrides", "priceSource",
  "cpu", "cpuFamily", "cpuGeneration", "ramGb", "ramType", "storageGb", "gpu", "gpuDedicated",
  "screenSizeIn", "resolution", "resolutionLabel", "panel", "touchscreen", "keyboard", "grade", "features",
  "operatingSystem", "warrantyMonths", "batteryHealthPct", "chargerIncluded", "weightKg", "conditionNotes", "details",
  "stock", "available", "deliveryMinDays", "deliveryMaxDays",
  "salePriceCents", "referencePriceCents", "vatScheme", "firstSeenAt", "lastSyncedAt", "qualityHold",
  // Väike JSON (rikastatud GPU / resolutsioon + päritolu), mitte toorandmed
  "enrichment",
] as const;
export const STOREFRONT_IMAGE_COLUMNS = [
  "productModelId", "position", "isHidden", "source", "type", "thumbnailPath", "mediumPath", "largePath", "width", "height", "alt",
  "visualHash", "imageQuality",
] as const;
export const STOREFRONT_LISTING_IMAGE_COLUMNS = [
  "supplierListingId", "position", "isHidden", "thumbnailUrl", "mediumUrl", "largeUrl", "width", "height", "alt",
  "visualHash", "imageQuality",
] as const;

type ModelRow = Pick<typeof productModels.$inferSelect, (typeof STOREFRONT_MODEL_COLUMNS)[number]>;
type ListingRow = Pick<typeof supplierListings.$inferSelect, (typeof STOREFRONT_LISTING_COLUMNS)[number]>;
export type GalleryImageRow = Pick<typeof productImages.$inferSelect, (typeof STOREFRONT_IMAGE_COLUMNS)[number]>;
export type GalleryListingImageRow = Pick<typeof listingImages.$inferSelect, (typeof STOREFRONT_LISTING_IMAGE_COLUMNS)[number]> & {
  /** Kui pakkumist pole `listings` hulgas (nt kassa laeb ainult ostukorvi pakkumised): mudel ja tarnija päringust */
  productModelId?: string;
  supplier?: string;
};

export interface IncompleteListing {
  sku: string;
  missing: string[];
}

const isBrand = (v: string): v is BrandCode => (BRAND_CODES as readonly string[]).includes(v);
const isGrade = (v: string | null): v is GradeCode => v !== null && (GRADE_CODES as readonly string[]).includes(v);
const VAT_SCHEMES: VatScheme[] = ["STANDARD", "MARGIN", "UNKNOWN"];

export function effectiveModel<T extends Pick<ModelRow, "manualOverrides">>(model: T): T {
  return applyOverrides(model, model.manualOverrides, MODEL_OVERRIDABLE_FIELDS);
}

export function effectiveListing<T extends Pick<ListingRow, "manualOverrides" | "priceSource">>(listing: T): T {
  return applyOverrides(listing, listing.manualOverrides, listingOverridableFields(listing.priceSource));
}

/** Poe jaoks kohustuslikud väljad, mis pakkumisel puuduvad. */
export function missingStorefrontFields(model: ModelRow, listing: ListingRow): string[] {
  const missing: string[] = [];
  if (!listing.cpu) missing.push("cpu");
  if (!listing.ramGb) missing.push("ram");
  if (!listing.storageGb) missing.push("storage");
  if (!isGrade(listing.grade)) missing.push("grade");
  if (listing.salePriceCents === null || listing.salePriceCents <= 0) missing.push("salePrice");
  if (!(model.screenSizeIn ?? listing.screenSizeIn)) missing.push("screenSize");
  if (!isBrand(model.manufacturer)) missing.push("manufacturer");
  return missing;
}

export function imageRowToView(image: GalleryImageRow): ProductImageView {
  return {
    thumbnailUrl: image.thumbnailPath,
    mediumUrl: image.mediumPath,
    largeUrl: image.largePath,
    width: image.width,
    height: image.height,
    alt: image.alt,
    type: image.type,
  };
}

/**
 * Tarnija pildid konkreetsest pakkumisest. Tüüp MODEL_GENERIC (mitte ACTUAL_UNIT): pole kinnitatud, et foto on
 * täpselt müüdavast eksemplarist — seega kuvatakse "illustratiivne" märge (ei väida rohkem, kui teame).
 */
export function listingImageRowToView(image: GalleryListingImageRow): ProductImageView {
  return {
    thumbnailUrl: image.thumbnailUrl,
    mediumUrl: image.mediumUrl,
    largeUrl: image.largeUrl,
    width: image.width,
    height: image.height,
    alt: image.alt,
    type: "MODEL_GENERIC",
  };
}

/**
 * Mudeli koondgaleriid: product_images (kõik allikad) + sama mudeli müügis pakkumiste pildid. Pakkumiste järjekord on
 * deterministlik ka siis, kui eri päringud laevad eri pakkumiste hulga (rohkem fotosid → pakkumise ID).
 */
function buildGalleries(listings: ListingRow[], images: GalleryImageRow[], listingImageRows: GalleryListingImageRow[]): Map<string, ProductImageView[]> {
  return new Map([...galleryCandidatesByModel(listings, images, listingImageRows)].map(([modelId, list]) => [modelId, buildModelGallery(list)]));
}

/**
 * Mudeli koondgalerii kandidaadid (enne dedupe't) mudeli ID kaupa — pood (buildModelGallery) ja rikastus
 * (usableGalleryCount: kas galeriid on vaja täiendada) kasutavad sama sisendit.
 */
export function galleryCandidatesByModel(
  listings: { id: string; productModelId: string; supplier: string; status: string; available: boolean | null }[],
  images: GalleryImageRow[],
  listingImageRows: GalleryListingImageRow[],
): Map<string, GalleryCandidate[]> {
  const candidates = new Map<string, GalleryCandidate[]>();
  const push = (modelId: string, candidate: GalleryCandidate) => candidates.set(modelId, [...(candidates.get(modelId) ?? []), candidate]);

  for (const image of images) {
    if (image.isHidden) continue;
    const group = groupForModelImage(image.source, image.type);
    // Laptopid.ee koopiad mudeli piltides (enrich:catalog) enne pakkumiste otse-fotosid
    push(image.productModelId, { view: imageRowToView(image), group, order: [0, 0, image.position], visualHash: image.visualHash, quality: image.imageQuality });
  }

  const listingMeta = new Map(listings.map((l) => [l.id, { productModelId: l.productModelId, supplier: l.supplier, onSale: l.status === "ACTIVE" && l.available !== false }]));
  const visible = listingImageRows.filter((image) => !image.isHidden);
  const countByListing = new Map<string, number>();
  for (const image of visible) countByListing.set(image.supplierListingId, (countByListing.get(image.supplierListingId) ?? 0) + 1);
  const listingOrder = [...countByListing.keys()].sort((a, b) => countByListing.get(b)! - countByListing.get(a)! || a.localeCompare(b));
  const rank = new Map(listingOrder.map((id, index) => [id, index]));
  for (const image of visible) {
    const meta = listingMeta.get(image.supplierListingId) ?? (image.productModelId && image.supplier ? { productModelId: image.productModelId, supplier: image.supplier, onSale: true } : null);
    if (!meta?.onSale) continue;
    push(meta.productModelId, {
      view: listingImageRowToView(image),
      group: groupForListingImage(meta.supplier),
      order: [1, rank.get(image.supplierListingId)!, image.position],
      visualHash: image.visualHash,
      quality: image.imageQuality,
    });
  }

  return candidates;
}

export function mapCatalogRows(
  models: ModelRow[],
  listings: ListingRow[],
  images: GalleryImageRow[],
  listingImageRows: GalleryListingImageRow[] = [],
): { items: SearchableItem[]; incomplete: IncompleteListing[] } {
  const modelById = new Map(models.map((m) => [m.id, effectiveModel(m)]));
  const galleries = buildGalleries(listings, images, listingImageRows);
  const products = new Map<string, CatalogItem["product"]>();
  const items: SearchableItem[] = [];
  const incomplete: IncompleteListing[] = [];

  for (const raw of listings) {
    const model = modelById.get(raw.productModelId);
    if (!model || model.status !== "ACTIVE" || raw.status !== "ACTIVE") continue;
    // Efektiivne: admini parandus ?? tarnija ?? rikastus (enrich:catalog; lehe renderdamisel välisallikaid ei küsita)
    const listing = applyListingEnrichment(effectiveListing(raw), raw.enrichment);
    // Kinni peetud (ülevaatus / blokeeritud rike) → poes, ostukorvis ega kassas ei kuvata
    if (listing.qualityHold) continue;
    const stock = resolveStock({ stock: listing.stock, available: listing.available });
    if (!stock.available) continue;

    const missing = missingStorefrontFields(model, listing);
    if (missing.length) {
      incomplete.push({ sku: listing.sku, missing });
      continue;
    }

    let product = products.get(model.id);
    if (!product) {
      const brand = model.manufacturer as BrandCode;
      product = {
        id: model.slug,
        slug: model.slug,
        brand,
        series: model.family,
        // Kliendile nähtav nimi (Lenovo "Gen 4" → "G4"); slug ja andmebaasi nimi jäävad kanooniliseks
        model: displayModelName(brand, model.model),
        title: displayProductTitle(brand, model.family, model.model),
        screenSizeIn: (model.screenSizeIn ?? listing.screenSizeIn)!,
        weightKg: model.weightKg,
        ports: { usbA: model.usbAPorts, usbC: model.usbCPorts },
        wifi: model.wifi,
        bluetooth: model.bluetooth,
        images: galleries.get(model.id) ?? [],
      };
      products.set(model.id, product);
    }

    // Kiirusindeks ja maks. sagedus: tarnija oma (details) → täpse vastega rikastus; admini CPU/GPU parandus tühistab need
    const performance = effectivePerformance({ details: listing.details, enrichment: raw.enrichment, manualOverrides: raw.manualOverrides });
    // Tarnija ei anna kõiki omadusi (Tech, Foxway) → puuduv võti = null (teadmata), mitte "Ei" — väärtusi ei leiutata
    const supplierFeatures = (listing.features ?? {}) as Partial<FeatureFlags>;
    const features = { ...Object.fromEntries(FEATURE_KEYS.map((key) => [key, supplierFeatures[key] ?? null])), touch: listing.touchscreen } as FeatureFlags;
    const item: CatalogItem = {
      product,
      variant: {
        id: publicListingId(listing.supplier, listing.supplierProductId),
        sku: listing.sku,
        supplier: listing.supplier,
        grade: listing.grade as GradeCode,
        cpu: { model: listing.cpu!, family: (listing.cpuFamily as CpuFamily | null) ?? null, generationKey: listing.cpuGeneration, maxGhz: performance.cpuMaxGhz, benchmark: performance.cpuBenchmark },
        ramGb: listing.ramGb!,
        ramType: listing.ramType,
        storageGb: listing.storageGb!,
        gpu: { model: displayGpu(listing.gpu, listing.gpuDedicated), dedicated: listing.gpuDedicated ?? false, benchmark: performance.gpuBenchmark },
        display: { resolution: listing.resolution, resolutionLabel: listing.resolutionLabel, panel: listing.panel, touch: listing.touchscreen },
        keyboardLayout: listing.keyboard?.trim() ? listing.keyboard.trim() : null,
        features,
        os: listing.operatingSystem,
        batteryHealthPct: listing.batteryHealthPct,
        chargerIncluded: listing.chargerIncluded,
        warrantyMonths: listing.warrantyMonths,
        price: {
          // Kliendi hind = täisarv eurodes (money.ts → roundToEuro); sama väärtus kaardil, tootelehel, ostukorvis ja kassas
          saleCents: roundToEuro(listing.salePriceCents!),
          referenceCents: listing.referencePriceCents === null ? null : roundToEuro(listing.referencePriceCents),
          vatScheme: VAT_SCHEMES.includes(listing.vatScheme as VatScheme) ? (listing.vatScheme as VatScheme) : "UNKNOWN",
        },
        stock,
        delivery:
          listing.deliveryMinDays !== null && listing.deliveryMaxDays !== null
            ? { minDays: listing.deliveryMinDays, maxDays: listing.deliveryMaxDays }
            : null,
        firstSeenAt: listing.firstSeenAt.toISOString(),
        lastSyncedAt: listing.lastSyncedAt ? listing.lastSyncedAt.toISOString() : null,
        isFeatured: model.featured,
        weightKg: listing.weightKg,
        conditionNotes: listing.conditionNotes,
        details: listing.details ?? {},
        // Kõik konfiguratsioonid kasutavad mudeli koondgaleriid (product.images)
        images: [],
      },
    };
    items.push({ ...item, searchText: buildSearchText(item) });
  }

  return { items, incomplete };
}

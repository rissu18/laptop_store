import { displayModelName, displayProductTitle } from "@/domain/catalog/display-name";
import { BRAND_CODES, type BrandCode, type CatalogItem, type CpuFamily, type FeatureFlags, type VatScheme } from "@/domain/catalog/types";
import { resolveStock } from "@/domain/catalog/availability";
import { buildSearchText } from "@/domain/catalog/search";
import type { SearchableItem } from "@/domain/catalog/filtering";
import { MODEL_OVERRIDABLE_FIELDS, applyOverrides, listingOverridableFields } from "@/domain/catalog/overrides";
import { GRADE_CODES, type GradeCode } from "@/domain/grade/grades";
import type { ProductImageView } from "@/domain/images/product-image";
import { publicListingId } from "@/server/db/seed/seed-catalog";
import type { listingImages, productImages, productModels, supplierListings } from "@/server/db/schema";

/**
 * Andmebaasi read → poe kataloogi kirjed (CatalogItem).
 * - Kasutab EFEKTIIVSEID väärtusi (admini parandus ?? tarnija väärtus).
 * - Poes näidatakse ainult ACTIVE mudelite ACTIVE pakkumisi, mis on saadaval (vt domain/catalog/availability.ts)
 *   ja millel on kõik poe jaoks kohustuslikud andmed (CPU, RAM, SSD, seisukord, müügihind, ekraan).
 *   Puudulikud pakkumised ei kao andmebaasist — need on adminis Data Quality all parandamiseks.
 * - Puuduvaid väärtusi ei asendata võltsitud vaikeväärtustega.
 * - Pildid: pakkumise oma pildid (listing_images, nt Laptopid.ee) → variant.images; mudeli pildid
 *   (product_images, nt Icecat) → product.images. Kuvamisel eelistatakse pakkumise pilte.
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
  "salePriceCents", "referencePriceCents", "vatScheme", "firstSeenAt", "lastSyncedAt",
] as const;
export const STOREFRONT_IMAGE_COLUMNS = [
  "productModelId", "position", "isHidden", "type", "thumbnailPath", "mediumPath", "largePath", "width", "height", "alt",
] as const;
export const STOREFRONT_LISTING_IMAGE_COLUMNS = [
  "supplierListingId", "position", "isHidden", "thumbnailUrl", "mediumUrl", "largeUrl", "width", "height", "alt",
] as const;

type ModelRow = Pick<typeof productModels.$inferSelect, (typeof STOREFRONT_MODEL_COLUMNS)[number]>;
type ListingRow = Pick<typeof supplierListings.$inferSelect, (typeof STOREFRONT_LISTING_COLUMNS)[number]>;
type ImageRow = Pick<typeof productImages.$inferSelect, (typeof STOREFRONT_IMAGE_COLUMNS)[number]>;
type ListingImageRow = Pick<typeof listingImages.$inferSelect, (typeof STOREFRONT_LISTING_IMAGE_COLUMNS)[number]>;

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

export function imageRowToView(image: ImageRow): ProductImageView {
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
export function listingImageRowToView(image: ListingImageRow): ProductImageView {
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

export function mapCatalogRows(
  models: ModelRow[],
  listings: ListingRow[],
  images: ImageRow[],
  listingImageRows: ListingImageRow[] = [],
): { items: SearchableItem[]; incomplete: IncompleteListing[] } {
  const modelById = new Map(models.map((m) => [m.id, effectiveModel(m)]));
  const imagesByModel = new Map<string, ProductImageView[]>();
  for (const image of [...images].sort((a, b) => a.position - b.position)) {
    if (image.isHidden) continue;
    const list = imagesByModel.get(image.productModelId) ?? [];
    list.push(imageRowToView(image));
    imagesByModel.set(image.productModelId, list);
  }
  const imagesByListing = new Map<string, ProductImageView[]>();
  for (const image of [...listingImageRows].sort((a, b) => a.position - b.position)) {
    if (image.isHidden) continue;
    const list = imagesByListing.get(image.supplierListingId) ?? [];
    list.push(listingImageRowToView(image));
    imagesByListing.set(image.supplierListingId, list);
  }

  // Mudeli piltide varu: kui mudelil endal (Icecat) pilte pole, kasutatakse sama mudeli mõne teise müügis pakkumise
  // tarnija pilte (nt Laptopid.ee fotod Techi sama mudeli pakkumisel). Need on MODEL_GENERIC → "illustratiivne" märge.
  const siblingImagesByModel = new Map<string, ProductImageView[]>();
  for (const listing of listings) {
    if (siblingImagesByModel.has(listing.productModelId) || listing.status !== "ACTIVE" || listing.available === false) continue;
    const own = imagesByListing.get(listing.id);
    if (own?.length) siblingImagesByModel.set(listing.productModelId, own);
  }

  const products = new Map<string, CatalogItem["product"]>();
  const items: SearchableItem[] = [];
  const incomplete: IncompleteListing[] = [];

  for (const raw of listings) {
    const model = modelById.get(raw.productModelId);
    if (!model || model.status !== "ACTIVE" || raw.status !== "ACTIVE") continue;
    const listing = effectiveListing(raw);
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
        images: imagesByModel.get(model.id) ?? siblingImagesByModel.get(model.id) ?? [],
      };
      products.set(model.id, product);
    }

    const features = { ...(listing.features as Partial<FeatureFlags>), touch: listing.touchscreen } as FeatureFlags;
    const item: CatalogItem = {
      product,
      variant: {
        id: publicListingId(listing.supplier, listing.supplierProductId),
        sku: listing.sku,
        grade: listing.grade as GradeCode,
        cpu: { model: listing.cpu!, family: (listing.cpuFamily as CpuFamily | null) ?? null, generationKey: listing.cpuGeneration },
        ramGb: listing.ramGb!,
        ramType: listing.ramType,
        storageGb: listing.storageGb!,
        gpu: { model: listing.gpu ?? "", dedicated: listing.gpuDedicated ?? false },
        display: { resolution: listing.resolution, resolutionLabel: listing.resolutionLabel, panel: listing.panel, touch: listing.touchscreen },
        keyboardLayout: listing.keyboard?.trim() ? listing.keyboard.trim() : null,
        features,
        os: listing.operatingSystem,
        batteryHealthPct: listing.batteryHealthPct,
        chargerIncluded: listing.chargerIncluded,
        warrantyMonths: listing.warrantyMonths,
        price: {
          saleCents: listing.salePriceCents!,
          referenceCents: listing.referencePriceCents,
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
        images: imagesByListing.get(listing.id) ?? [],
      },
    };
    items.push({ ...item, searchText: buildSearchText(item) });
  }

  return { items, incomplete };
}

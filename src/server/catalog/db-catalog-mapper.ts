import { BRAND_CODES, BRAND_NAMES, KEYBOARD_LAYOUTS, type BrandCode, type CatalogItem, type CpuFamily, type FeatureFlags, type KeyboardLayout, type VatScheme } from "@/domain/catalog/types";
import { buildSearchText } from "@/domain/catalog/search";
import type { SearchableItem } from "@/domain/catalog/filtering";
import { LISTING_OVERRIDABLE_FIELDS, MODEL_OVERRIDABLE_FIELDS, applyOverrides } from "@/domain/catalog/overrides";
import { GRADE_CODES, type GradeCode } from "@/domain/grade/grades";
import type { ProductImageView } from "@/domain/images/product-image";
import { publicListingId } from "@/server/db/seed/seed-catalog";
import type { productImages, productModels, supplierListings } from "@/server/db/schema";

/**
 * Andmebaasi read → poe kataloogi kirjed (CatalogItem).
 * - Kasutab EFEKTIIVSEID väärtusi (admini parandus ?? tarnija väärtus).
 * - Poes näidatakse ainult ACTIVE mudelite ACTIVE pakkumisi, mis on laos ja millel on kõik poe jaoks
 *   kohustuslikud andmed (CPU, RAM, SSD, seisukord, müügihind, ekraan). Puudulikud pakkumised ei kao
 *   andmebaasist — need on adminis Data Quality all parandamiseks.
 * - Puuduvaid väärtusi ei asendata võltsitud vaikeväärtustega.
 */

type ModelRow = typeof productModels.$inferSelect;
type ListingRow = typeof supplierListings.$inferSelect;
type ImageRow = typeof productImages.$inferSelect;

export interface IncompleteListing {
  sku: string;
  missing: string[];
}

const isBrand = (v: string): v is BrandCode => (BRAND_CODES as readonly string[]).includes(v);
const isGrade = (v: string | null): v is GradeCode => v !== null && (GRADE_CODES as readonly string[]).includes(v);
const isKeyboard = (v: string | null): v is KeyboardLayout => v !== null && (KEYBOARD_LAYOUTS as readonly string[]).includes(v);
const VAT_SCHEMES: VatScheme[] = ["STANDARD", "MARGIN", "UNKNOWN"];

export function effectiveModel(model: ModelRow): ModelRow {
  return applyOverrides(model, model.manualOverrides, MODEL_OVERRIDABLE_FIELDS);
}

export function effectiveListing(listing: ListingRow): ListingRow {
  return applyOverrides(listing, listing.manualOverrides, LISTING_OVERRIDABLE_FIELDS);
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

export function mapCatalogRows(
  models: ModelRow[],
  listings: ListingRow[],
  images: ImageRow[],
): { items: SearchableItem[]; incomplete: IncompleteListing[] } {
  const modelById = new Map(models.map((m) => [m.id, effectiveModel(m)]));
  const imagesByModel = new Map<string, ProductImageView[]>();
  for (const image of [...images].sort((a, b) => a.position - b.position)) {
    if (image.isHidden) continue;
    const list = imagesByModel.get(image.productModelId) ?? [];
    list.push(imageRowToView(image));
    imagesByModel.set(image.productModelId, list);
  }

  const products = new Map<string, CatalogItem["product"]>();
  const items: SearchableItem[] = [];
  const incomplete: IncompleteListing[] = [];

  for (const raw of listings) {
    const model = modelById.get(raw.productModelId);
    if (!model || model.status !== "ACTIVE" || raw.status !== "ACTIVE") continue;
    const listing = effectiveListing(raw);
    if ((listing.stock ?? 0) <= 0) continue;

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
        model: model.model,
        title: `${BRAND_NAMES[brand]} ${model.family.replace(/ P$/, "")} ${model.model}`,
        screenSizeIn: (model.screenSizeIn ?? listing.screenSizeIn)!,
        weightKg: model.weightKg,
        ports: { usbA: model.usbAPorts, usbC: model.usbCPorts },
        wifi: model.wifi,
        bluetooth: model.bluetooth,
        images: imagesByModel.get(model.id) ?? [],
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
        keyboardLayout: isKeyboard(listing.keyboard) ? listing.keyboard : null,
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
        stock: { quantity: listing.stock ?? 0 },
        delivery:
          listing.deliveryMinDays !== null && listing.deliveryMaxDays !== null
            ? { minDays: listing.deliveryMinDays, maxDays: listing.deliveryMaxDays }
            : null,
        firstSeenAt: listing.firstSeenAt.toISOString(),
        lastSyncedAt: listing.lastSyncedAt ? listing.lastSyncedAt.toISOString() : null,
        isFeatured: model.featured,
        images: [],
      },
    };
    items.push({ ...item, searchText: buildSearchText(item) });
  }

  return { items, incomplete };
}

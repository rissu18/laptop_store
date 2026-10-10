import { BRAND_NAMES, type CatalogItem, type CatalogProduct, type CatalogVariant } from "@/domain/catalog/types";
import type { ProductImageView } from "@/domain/images/product-image";
import { buildSearchText } from "@/domain/catalog/search";
import type { SearchableItem } from "@/domain/catalog/filtering";
import { PricingError, calculatePrice, type PricingConfig } from "@/domain/pricing/pricing-engine";
import { slugify } from "@/integrations/supplier/model-names";
import type { NormalizedOffer } from "@/integrations/supplier/normalized-offer";
import type { SupplierCatalogResult } from "@/integrations/supplier/supplier-adapter";

/**
 * Tarnija pakkumised → meie kataloog (Product + ProductVariant) koos müügihinnaga.
 * Phase 4-s teeb sama töö sync worker ja kirjutab tulemuse andmebaasi.
 */

export interface CatalogBuildOptions {
  pricing: PricingConfig;
  featuredExternalIds: string[];
  /** Viimase eduka sync'i aeg; `null`, kui päris sync pole jooksnud. */
  lastSyncedAt: string | null;
  /** Mudelipildid (ProductModel ID → pildid), nt Icecati import */
  modelImages?: Record<string, ProductImageView[]>;
}

export interface CatalogBuildIssue {
  externalId: string | null;
  stage: string;
  message: string;
}

export interface BuiltCatalog {
  items: SearchableItem[];
  issues: CatalogBuildIssue[];
}

export function productFromOffer(offer: NormalizedOffer): CatalogProduct {
  const title = `${BRAND_NAMES[offer.brand]} ${offer.series.replace(/ P$/, "")} ${offer.model}`;
  const slug = slugify(title);
  return {
    id: slug,
    slug,
    brand: offer.brand,
    series: offer.series,
    model: offer.model,
    title,
    screenSizeIn: offer.screenSizeIn,
    weightKg: offer.weightKg,
    ports: { usbA: offer.usbAPorts, usbC: offer.usbCPorts },
    wifi: offer.wifi,
    bluetooth: offer.bluetooth,
    images: [],
  };
}

function variantFromOffer(offer: NormalizedOffer, saleCents: number, options: CatalogBuildOptions): CatalogVariant {
  return {
    id: `${offer.supplierCode}-${offer.externalId}`.toLowerCase(),
    sku: `SP-${offer.externalId.replace(/^\D+-?/, "")}`,
    grade: offer.grade,
    cpu: { model: offer.cpuModel, family: offer.cpuFamily, generationKey: offer.cpuGenerationKey },
    ramGb: offer.ramGb,
    ramType: offer.ramType,
    storageGb: offer.storageGb,
    gpu: { model: offer.gpuModel, dedicated: offer.gpuDedicated },
    display: {
      resolution: offer.resolution,
      resolutionLabel: offer.resolutionLabel,
      panel: offer.panel,
      touch: offer.features.touch,
    },
    keyboardLayout: offer.keyboardLayout,
    features: offer.features,
    os: offer.os,
    batteryHealthPct: offer.batteryHealthPct,
    chargerIncluded: offer.chargerIncluded,
    warrantyMonths: offer.warrantyMonths,
    price: {
      saleCents,
      // Varasem hind tuleb ainult päris hinnaajaloost (Phase 4). Praegu seda pole → null.
      referenceCents: null,
      vatScheme: offer.vatScheme,
    },
    stock: { quantity: offer.stockQuantity },
    // Tarneaeg tuleb tarnija pakkumisest; puudumisel null (poe vaikeväärtust ei panda)
    delivery: offer.deliveryDays,
    firstSeenAt: offer.listedAt ?? "1970-01-01T00:00:00Z",
    lastSyncedAt: options.lastSyncedAt,
    isFeatured: options.featuredExternalIds.includes(offer.externalId),
    // Tarnija fotod konkreetsest ühikust (ACTUAL_UNIT) lisanduvad, kui tarnija neid annab
    images: [],
  };
}

export function buildCatalog(source: SupplierCatalogResult, options: CatalogBuildOptions): BuiltCatalog {
  const issues: CatalogBuildIssue[] = source.rejected.map((r) => ({ ...r }));
  const products = new Map<string, CatalogProduct>();
  const items: SearchableItem[] = [];

  for (const offer of source.offers) {
    // Laost otsas tooteid avalikus kataloogis ei näidata (andmebaasis jäävad alles)
    if (offer.stockQuantity <= 0) continue;

    let saleCents: number;
    try {
      saleCents = calculatePrice(options.pricing, { costCents: offer.costCents, vatScheme: offer.vatScheme }).saleCents;
    } catch (error) {
      if (!(error instanceof PricingError)) throw error;
      issues.push({ externalId: offer.externalId, stage: "price", message: error.message });
      continue;
    }

    const draft = productFromOffer(offer);
    // Sama mudeli esimene pakkumine määrab mudeli andmed; pildid on mudeli tasemel
    const product = products.get(draft.slug) ?? { ...draft, images: options.modelImages?.[draft.slug] ?? [] };
    products.set(product.slug, product);

    const item: CatalogItem = { product, variant: variantFromOffer(offer, saleCents, options) };
    items.push({ ...item, searchText: buildSearchText(item) });
  }

  return { items, issues };
}

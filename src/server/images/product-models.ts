import { BRAND_NAMES } from "@/domain/catalog/types";
import type { NormalizedOffer } from "@/integrations/supplier/normalized-offer";
import { productFromOffer } from "@/server/catalog/build-catalog";
import type { ModelToImport } from "./icecat-image-import";

/**
 * Tarnija pakkumised → unikaalsed mudelid (ProductModel) koos tarnija GTIN/MPN koodidega.
 * Üks mudel võib koondada mitu pakkumist (konfiguratsiooni); pildid tulevad mudeli tasemel.
 */
export interface ProductModelWithIdentifiers {
  model: ModelToImport;
  supplierIdentifiers: { gtins: string[]; mpns: string[] };
  offerCount: number;
}

export function groupOffersIntoModels(offers: NormalizedOffer[]): ProductModelWithIdentifiers[] {
  const models = new Map<string, ProductModelWithIdentifiers>();
  for (const offer of offers) {
    const product = productFromOffer(offer);
    const brandName = BRAND_NAMES[product.brand];
    const entry = models.get(product.slug) ?? {
      model: {
        id: product.slug,
        title: product.title,
        brandName,
        modelName: product.title.slice(brandName.length).trim(),
      },
      supplierIdentifiers: { gtins: [], mpns: [] },
      offerCount: 0,
    };
    if (offer.gtin) entry.supplierIdentifiers.gtins.push(offer.gtin);
    if (offer.mpn) entry.supplierIdentifiers.mpns.push(offer.mpn);
    entry.offerCount++;
    models.set(product.slug, entry);
  }
  return [...models.values()].sort((a, b) => a.model.id.localeCompare(b.model.id));
}

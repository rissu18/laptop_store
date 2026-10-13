import { cardImageView } from "@/domain/images/product-image";
import type { CatalogItem } from "./types";

/**
 * Tootekaardi andmed brauserisse saatmiseks (kataloogi esmane leht ja /api/catalog vastus).
 * Sama kuju mis CatalogItem (ProductCard ei muutu), aga kaardil kasutamata rasked väljad on tühjad:
 *   - pildid: mudeli koondgalerii esimesed CARD_MAX_IMAGES pilti ja ainult kasutatud URL-id;
 *   - `details` (pordid jms) ja `conditionNotes` (tarnija märkus) → tühi — need on tootelehel.
 * Tarnija toorandmeid, ostuhinda ega seerianumbreid CatalogItem'is niikuinii pole.
 */
/** Kaardi pildisirvijas kuni 8 esimest pilti mudeli koondgaleriist (tooteleht näitab kõiki) */
export const CARD_MAX_IMAGES = 8;

export function toCardItem({ product, variant }: CatalogItem): CatalogItem {
  const ownImages = variant.images.length > 0;
  return {
    product: { ...product, images: ownImages ? [] : product.images.slice(0, CARD_MAX_IMAGES).map(cardImageView) },
    variant: { ...variant, images: variant.images.slice(0, CARD_MAX_IMAGES).map(cardImageView), details: {}, conditionNotes: null },
  };
}

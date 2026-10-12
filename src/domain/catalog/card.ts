import { cardImageView } from "@/domain/images/product-image";
import type { CatalogItem } from "./types";

/**
 * Tootekaardi andmed brauserisse saatmiseks (kataloogi esmane leht ja /api/catalog vastus).
 * Sama kuju mis CatalogItem (ProductCard ei muutu), aga kaardil kasutamata rasked väljad on tühjad:
 *   - pildid: ainult kuvatavad (pakkumise pildid, nende puudumisel mudeli omad) ja ainult kasutatud URL-id;
 *   - `details` (pordid jms) ja `conditionNotes` (tarnija märkus) → tühi — need on tootelehel.
 * Tarnija toorandmeid, ostuhinda ega seerianumbreid CatalogItem'is niikuinii pole.
 */
export function toCardItem({ product, variant }: CatalogItem): CatalogItem {
  const ownImages = variant.images.length > 0;
  return {
    product: { ...product, images: ownImages ? [] : product.images.map(cardImageView) },
    variant: { ...variant, images: variant.images.map(cardImageView), details: {}, conditionNotes: null },
  };
}

import type { CatalogItem } from "./types";

/**
 * URL-id. Tootelehe URL on mudeli tasemel (stabiilne, SEO jaoks hea);
 * konkreetne konfiguratsioon valitakse parameetriga. Canonical on alati ilma parameetrita.
 */
export const CONFIGURATION_PARAM = "konfiguratsioon";

export function productPath(slug: string): string {
  return `/toode/${slug}`;
}

export function productHref({ product, variant }: CatalogItem): string {
  return `${productPath(product.slug)}?${CONFIGURATION_PARAM}=${encodeURIComponent(variant.id)}`;
}

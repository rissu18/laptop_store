import type { CatalogVariant } from "./types";

/**
 * Mudeli konfiguratsioonide järjestus ja vaikimisi valik tootelehel.
 *
 *   1. "Poes kohapeal" (sama ettevõtte salong) — hind kasvavalt
 *   2. kõik ülejäänud (Tech, Foxway …) — hind kasvavalt; tarneaeg (1–2 vs 2–4 päeva) EI anna eelist
 *   3. võrdse hinna korral SKU (koodipunkti järgi, mitte lokaadi) → id — järjestus ei muutu renderduste/sync'ide vahel
 *
 * Vaikimisi valik = esimene saadaval konfiguratsioon selles järjestuses: kui mudelil on kohapeal variant, siis
 * odavaim kohapeal variant (mitte kogu mudeli odavaim hulgilao variant); muidu odavaim saadaval variant.
 * Mitteaktiivsed, kinni peetud (REVIEW/BLOCKED) ja otsas pakkumised ei jõua siia üldse (db-catalog-mapper).
 */

type OrderFields = Pick<CatalogVariant, "id" | "sku" | "price" | "stock" | "delivery">;

/** Kohe salongis olemas: saadaval, täpne kogus teadmata ja tarnija tarneaega pole (Laptopid.ee) */
export function isInStore(variant: Pick<CatalogVariant, "stock" | "delivery">): boolean {
  return variant.stock.available && variant.stock.quantity === null && variant.delivery === null;
}

const byCodePoint = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

export function compareConfigurations(a: OrderFields, b: OrderFields): number {
  return (
    Number(!isInStore(a)) - Number(!isInStore(b)) ||
    a.price.saleCents - b.price.saleCents ||
    byCodePoint(a.sku, b.sku) ||
    byCodePoint(a.id, b.id)
  );
}

export function sortConfigurations<T extends OrderFields>(variants: readonly T[]): T[] {
  return [...variants].sort(compareConfigurations);
}

/** Vaikimisi valitud konfiguratsioon (QuickSpecs, seisukord, tarne, hind ja ostukorv lähtuvad sellest) */
export function defaultConfiguration<T extends OrderFields>(variants: readonly T[]): T | undefined {
  const sorted = sortConfigurations(variants);
  return sorted.find((variant) => variant.stock.available) ?? sorted[0];
}

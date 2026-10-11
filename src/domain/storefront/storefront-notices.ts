import type { TrustItem } from "@/config/store";

/**
 * Kliendile nähtavad prototüübi tekstid ühes kohas (testitav). Kataloog (tooted, hinnad, saadavus)
 * tuleb päris tarnija andmetest — testandmed on ainult tellimused, makseid veel pole.
 */
export const PROTOTYPE_NOTICE = {
  label: "Prototüüp:",
  text: "toodete, hindade ja saadavuse andmed on live. Tellimused on testtellimused — makseid ei võeta ja tellimusi ei täideta.",
} as const;

/** Usaldusriba makse-punkt seni, kuni päris maksed pole avatud (admini tekst võib väita vastupidist). */
export const PAYMENTS_PENDING_TRUST_ITEM = { title: "Makseviisid", detail: "Makseviisid lisanduvad poe avamisel" } as const;

/**
 * Kas kliendile tohib väita, et maksmine töötab: ainult LIVE kassa (prototüüp väljas + makseteenus olemas).
 * Seni asendatakse admini makse-punkt ausa tekstiga; ülejäänud punktid jäävad admini sõnastusse.
 */
export function storefrontTrustItems(items: TrustItem[], paymentsLive: boolean): TrustItem[] {
  if (paymentsLive) return items;
  return items.map((item) => (item.key === "payment" ? { ...item, ...PAYMENTS_PENDING_TRUST_ITEM } : item));
}

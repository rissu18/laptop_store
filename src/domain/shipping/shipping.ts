import type { Settings } from "@/domain/settings/settings";
import { roundToEuro } from "@/domain/money/money";

/**
 * Tarneviisid. Praegu üks lihtne meetod seadetest (STANDARD); pakiautomaatide ja kullerite API-d
 * (Omniva, DPD, SmartPOST) lisanduvad hiljem sama liidese taha. Valikut, mis tegelikult ei tööta
 * (nt pakiautomaadi valik ilma API-ta), kliendile ei näidata.
 */
export interface ShippingMethod {
  code: string;
  name: string;
  priceCents: number;
  /** Tasuta tarne alates (toodete summa pärast soodustust); null = ei kehti */
  freeFromCents: number | null;
  /** Kas meetod vajab pakiautomaadi valikut (tulevikus) */
  requiresPickupPoint: boolean;
}

export function availableShippingMethods(delivery: Settings["delivery"]): ShippingMethod[] {
  return [
    {
      code: "STANDARD",
      name: delivery.standardShippingName,
      // Kliendi hinnad on täisarvud (money.ts → roundToEuro): seadetes 6,99 € → poes ja kassas 7 €
      priceCents: roundToEuro(delivery.standardShippingCents),
      freeFromCents: delivery.freeShippingThresholdCents,
      requiresPickupPoint: false,
    },
  ];
}

export interface ShippingQuote {
  method: ShippingMethod;
  amountCents: number;
  /** Miks tarne on tasuta (kliendile selgituseks) */
  freeReason: "COUPON" | "THRESHOLD" | null;
}

/** Tarne hind: tasuta, kui sooduskood annab tasuta tarne või summa ületab tasuta tarne piiri. */
export function quoteShipping(method: ShippingMethod, productsTotalCents: number, freeShippingCoupon: boolean): ShippingQuote {
  if (freeShippingCoupon) return { method, amountCents: 0, freeReason: "COUPON" };
  if (method.freeFromCents !== null && productsTotalCents >= method.freeFromCents) return { method, amountCents: 0, freeReason: "THRESHOLD" };
  return { method, amountCents: method.priceCents, freeReason: null };
}

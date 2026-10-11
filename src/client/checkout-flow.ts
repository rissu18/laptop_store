import type { PlaceOrderActionResult } from "@/server/checkout/checkout-actions";

/**
 * Kassa vastuse käsitlus brauseris. Ostukorv tühjendatakse AINULT siis, kui server kinnitas tellimuse
 * loomise; iga muu vastuse (viga, ülevaatus, valideerimine) korral jääb ostukorv alles.
 */
export interface CheckoutFlowDeps {
  clearCart: () => void;
  forgetAttempt: () => void;
  navigate: (url: string) => void;
}

export function handlePlaceOrderResult(result: PlaceOrderActionResult, deps: CheckoutFlowDeps): "DONE" | "STAY" {
  if (!result.ok) return "STAY";
  deps.forgetAttempt();
  deps.clearCart();
  deps.navigate(`/tellimus/${result.orderNumber}/kinnitus`);
  return "DONE";
}

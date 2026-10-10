"use server";

import { resolveCart } from "@/server/cart/cart-actions";
import type { PublicDiscountResult } from "./discount-service";

/**
 * Avalik sooduskoodi kontroll (server action).
 * Sisend: koodi tekst + ostukorvi read (ainult ID-d ja kogused). Hinnad ja soodustus arvutatakse serveris.
 * Väljund ei sisalda admini märkmeid ega kasutuse andmeid.
 */
export async function validateDiscountAction(code: unknown, cart: unknown): Promise<PublicDiscountResult> {
  const resolved = await resolveCart(cart, typeof code === "string" ? code : "");
  return (
    resolved.discount ?? {
      valid: false,
      code: "",
      eligibleSubtotalCents: 0,
      discountAmountCents: 0,
      freeShipping: false,
      reason: resolved.lines.length ? "NOT_FOUND" : "EMPTY_CART",
      message: resolved.lines.length ? "Sooduskoodi ei leitud." : "Ostukorv on tühi.",
    }
  );
}

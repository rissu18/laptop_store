"use client";

import { createPersistentStore } from "./persistent-store";

/**
 * Ostukorv prototüübis (Phase 1). Phase 5-s liigub ostukorv andmebaasi (Cart tabel + httpOnly cookie).
 */
export interface CartLineRef {
  variantId: string;
  quantity: number;
}

const MAX_LINES = 20;
const MAX_QUANTITY = 10;

function validateCart(value: unknown): CartLineRef[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter(
      (line): line is CartLineRef =>
        typeof line?.variantId === "string" &&
        line.variantId.length < 100 &&
        Number.isInteger(line.quantity) &&
        line.quantity > 0,
    )
    .map((line) => ({ variantId: line.variantId, quantity: Math.min(line.quantity, MAX_QUANTITY) }))
    .slice(0, MAX_LINES);
}

const store = createPersistentStore<CartLineRef[]>("cart:v1", [], validateCart);

export const useCart = store.useValue;

export function addToCart(variantId: string, quantity = 1) {
  store.set((lines) => {
    const existing = lines.find((line) => line.variantId === variantId);
    if (existing) {
      return lines.map((line) =>
        line.variantId === variantId ? { ...line, quantity: Math.min(line.quantity + quantity, MAX_QUANTITY) } : line,
      );
    }
    return [...lines, { variantId, quantity }].slice(0, MAX_LINES);
  });
}

export function setCartQuantity(variantId: string, quantity: number) {
  store.set((lines) =>
    quantity <= 0
      ? lines.filter((line) => line.variantId !== variantId)
      : lines.map((line) => (line.variantId === variantId ? { ...line, quantity: Math.min(quantity, MAX_QUANTITY) } : line)),
  );
}

export function removeFromCart(variantId: string) {
  store.set((lines) => lines.filter((line) => line.variantId !== variantId));
}

export function cartItemCount(lines: CartLineRef[]): number {
  return lines.reduce((sum, line) => sum + line.quantity, 0);
}

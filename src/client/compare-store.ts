"use client";

import { createPersistentStore } from "./persistent-store";

export const MAX_COMPARE = 4;

function validateIds(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((id): id is string => typeof id === "string" && id.length < 100).slice(0, MAX_COMPARE);
}

const store = createPersistentStore<string[]>("compare:v1", [], validateIds);

export const useCompare = store.useValue;

/** Tagastab `false`, kui võrdlus on juba täis. */
export function toggleCompare(variantId: string): boolean {
  const current = store.get();
  if (!current.includes(variantId) && current.length >= MAX_COMPARE) return false;
  store.set((ids) => (ids.includes(variantId) ? ids.filter((id) => id !== variantId) : [...ids, variantId]));
  return true;
}

export function removeFromCompare(variantId: string) {
  store.set((ids) => ids.filter((id) => id !== variantId));
}

export function clearCompare() {
  store.set(() => []);
}

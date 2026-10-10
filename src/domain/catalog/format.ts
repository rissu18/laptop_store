import type { CatalogItem, KeyboardLayout } from "./types";

/** Tehniliste väärtuste vormindamine eesti keeles. */

export function formatStorage(gb: number): string {
  return gb >= 1024 ? `${String(gb / 1024).replace(".", ",")} TB` : `${gb} GB`;
}

export function formatScreenSize(inches: number): string {
  return `${String(inches).replace(".", ",")}"`;
}

export function formatWeight(kg: number): string {
  return `${kg.toFixed(2).replace(".", ",")} kg`;
}

export function formatDeliveryDays(min: number, max: number): string {
  return min === max ? `${min} tööpäeva` : `${min}–${max} tööpäeva`;
}

export const KEYBOARD_SHORT: Record<KeyboardLayout, string> = {
  SWE: "SWE klaviatuur",
  NOR: "NOR klaviatuur",
  EST: "EST klaviatuur",
  US: "US klaviatuur",
  UK: "UK klaviatuur",
  DE: "DE klaviatuur",
};

/** "14" WUXGA IPS" */
export function formatDisplaySummary({ product, variant }: CatalogItem): string {
  return [formatScreenSize(product.screenSizeIn), variant.display.resolutionLabel, variant.display.panel]
    .filter(Boolean)
    .join(" ");
}

/** "i5-1235U · 16 GB · 512 GB" — autocomplete'i ja ostukorvi jaoks */
export function formatSpecLine({ variant }: CatalogItem): string {
  const cpuShort = variant.cpu.model.replace(/^(Intel|AMD)\s+(Core\s+)?/, "");
  return `${cpuShort} · ${variant.ramGb} GB · ${formatStorage(variant.storageGb)}`;
}

/** Konfiguratsiooni pealkiri: "Intel Core i5-1235U / 16 GB / 512 GB SSD" */
export function formatConfigurationTitle({ variant }: CatalogItem): string {
  return `${variant.cpu.model} / ${variant.ramGb} GB / ${formatStorage(variant.storageGb)} SSD`;
}

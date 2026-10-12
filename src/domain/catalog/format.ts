import { keyboardLabel } from "./keyboard";
import type { CatalogItem } from "./types";

/** Tehniliste väärtuste vormindamine eesti keeles. */

/** 512 → "512 GB"; 1024 → "1 TB"; 2000 (tarnija kümnendkujul) → "2 TB" — mitte "1,953125 TB" */
export function formatStorage(gb: number): string {
  if (gb < 1000) return `${gb} GB`;
  // Binaarne (1024 → 1, 1536 → 1,5), kui see on täpne; muidu tarnija kümnendkuju (2000 → 2)
  const binary = gb / 1024;
  const tb = Number.isInteger(binary * 100) ? binary : Math.round(gb / 10) / 100;
  return `${String(tb).replace(".", ",")} TB`;
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

/** "Skandinaavia (SCA) klaviatuur" — kaardil, ostukorvis, tellimuses */
export function formatKeyboard(code: string): string {
  return `${keyboardLabel(code)} klaviatuur`;
}

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

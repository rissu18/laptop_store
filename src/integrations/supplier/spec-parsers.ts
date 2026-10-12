import { parseCpuInfo, type ParsedCpuInfo } from "@/domain/catalog/cpu-filter";
import { normalizeKeyboard } from "@/domain/catalog/keyboard";
import type { KeyboardLayout } from "@/domain/catalog/types";

/**
 * Tarnijate tekstiliste spetsifikatsioonide parsimine.
 * Tarnijad kirjutavad sama asja erinevalt ("16GB DDR4", "16 GB", "16384MB").
 * Need funktsioonid on adapterite vahel jagatud ja unit-testitud.
 */

export type ParsedCpu = ParsedCpuInfo;

/**
 * Tarnija CPU nimi → perekond + põlvkond. Üks keskne parser (domain/catalog/cpu-filter.ts → parseCpuInfo), sama mida
 * kasutab poe filter: Intel Core i (i5-8350U → 8.), Core seeria 1 (Core 7 150U), Core Ultra, Ryzen (turunduse
 * seeria), Ryzen AI, Apple M (kiibi põlvkond), Snapdragon X. Kindlalt tuletamatu → null.
 */
export function parseCpu(raw: string): ParsedCpu {
  return parseCpuInfo(raw);
}

export function parseRam(raw: string): { gb: number; type: string | null } | null {
  const size = raw.match(/(\d+)\s*(GB|MB)/i);
  if (!size) return null;
  const gb = size[2].toUpperCase() === "MB" ? Math.round(Number(size[1]) / 1024) : Number(size[1]);
  const type = raw.match(/\b(LP)?DDR\d[xX]?\b/)?.[0] ?? null;
  return gb > 0 ? { gb, type } : null;
}

export function parseStorageGb(raw: string): number | null {
  const match = raw.match(/(\d+(?:[.,]\d+)?)\s*(TB|GB)/i);
  if (!match) return null;
  const value = Number(match[1].replace(",", "."));
  const gb = match[2].toUpperCase() === "TB" ? Math.round(value * 1024) : Math.round(value);
  return gb > 0 ? gb : null;
}

const RESOLUTION_LABELS: Record<string, string> = {
  "1366x768": "HD",
  "1600x900": "HD+",
  "1920x1080": "FHD",
  "1920x1200": "WUXGA",
  "2560x1440": "QHD",
  "2560x1600": "WQXGA",
  "2880x1800": "2.8K",
  "3840x2160": "4K UHD",
  "3840x2400": "WQUXGA",
};

export interface ParsedDisplay {
  sizeIn: number;
  resolution: string | null;
  resolutionLabel: string | null;
  panel: string | null;
  touch: boolean;
}

export function parseDisplay(raw: string): ParsedDisplay | null {
  const size = raw.match(/(\d{2}(?:[.,]\d)?)\s*(?:"|''|in\b|tolli)/i);
  if (!size) return null;
  const resolution = raw.match(/(\d{4})\s*[x×]\s*(\d{3,4})/);
  const resolutionKey = resolution ? `${resolution[1]}x${resolution[2]}` : null;
  return {
    sizeIn: Number(size[1].replace(",", ".")),
    resolution: resolutionKey,
    resolutionLabel: resolutionKey ? (RESOLUTION_LABELS[resolutionKey] ?? null) : null,
    panel: raw.match(/\b(IPS|OLED|TN|VA)\b/i)?.[1].toUpperCase() ?? null,
    touch: /\btouch/i.test(raw),
  };
}

/**
 * Tarnija klaviatuuri tähis → registris olev kanooniline kood (domain/catalog/keyboard.ts). Tundmatu → null
 * (Laptopid.ee/mock: toorkuju säilib details.keyboardRaw all). Foxway kasutab normalizeKeyboard'i otse (säilitab ka
 * tundmatu koodi toorkujul).
 */
export function parseKeyboardLayout(raw: string | null | undefined): KeyboardLayout | null {
  const result = normalizeKeyboard(raw);
  return result.known ? result.code : null;
}

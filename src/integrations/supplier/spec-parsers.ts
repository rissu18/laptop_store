import type { CpuFamily, KeyboardLayout } from "@/domain/catalog/types";

/**
 * Tarnijate tekstiliste spetsifikatsioonide parsimine.
 * Tarnijad kirjutavad sama asja erinevalt ("16GB DDR4", "16 GB", "16384MB").
 * Need funktsioonid on adapterite vahel jagatud ja unit-testitud.
 */

export interface ParsedCpu {
  family: CpuFamily | null;
  generationKey: string | null;
}

export function parseCpu(raw: string): ParsedCpu {
  const text = raw.replace(/\s+/g, " ").trim();

  // Intel Core Ultra 7 155U → ultra-7, seeria 1
  const ultra = text.match(/core\s*ultra\s*([579])\s*(\d)\d{2}[a-z]*/i);
  if (ultra) {
    const tier = ultra[1];
    const family = tier === "5" || tier === "7" ? (`intel-core-ultra-${tier}` as CpuFamily) : null;
    return { family, generationKey: `ultra-${ultra[2]}` };
  }

  // Intel Core i5-1235U → i5, 12. põlvkond; i5-8350U → 8; i7-10610U → 10; i7-11850H → 11
  const core = text.match(/\bi([3579])[-\s]?(\d{4,5})[a-z0-9]*/i);
  if (core) {
    const digits = core[2];
    const generation = digits.startsWith("1") ? Number(digits.slice(0, 2)) : Number(digits[0]);
    return { family: `intel-core-i${core[1]}` as CpuFamily, generationKey: `intel-${generation}` };
  }

  // AMD Ryzen 5 PRO 5650U → ryzen-5, 5000-seeria
  const ryzen = text.match(/ryzen\s*([3579])\s*(?:pro\s*)?(\d)\d{3}[a-z]*/i);
  if (ryzen) {
    return { family: `amd-ryzen-${ryzen[1]}` as CpuFamily, generationKey: `amd-${ryzen[2]}000` };
  }

  return { family: null, generationKey: null };
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

const KEYBOARD_ALIASES: Record<string, KeyboardLayout> = {
  SE: "SWE",
  SWE: "SWE",
  FI: "SWE", // Soome ja Rootsi paigutus on identsed
  FIN: "SWE",
  NORDIC: "SWE",
  NO: "NOR",
  NOR: "NOR",
  EE: "EST",
  EST: "EST",
  US: "US",
  UK: "UK",
  GB: "UK",
  DE: "DE",
  GER: "DE",
};

export function parseKeyboardLayout(raw: string | null | undefined): KeyboardLayout | null {
  if (!raw) return null;
  return KEYBOARD_ALIASES[raw.trim().toUpperCase()] ?? null;
}

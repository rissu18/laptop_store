import { isNotLaptop } from "@/integrations/supplier/form-factor";
import { parseCpu } from "@/integrations/supplier/spec-parsers";
import { ModelResolutionError, resolveModelRef, type ModelRef } from "@/integrations/supplier/model-resolver";
import { classifyTechNotes, TECH_DEFECT_LABELS, type TechNoteFeatures, type TechNoteResult } from "./tech-notes";
import type { TechSourceRow } from "./tech-parser";

/**
 * Tech hinnakirja rida → üks füüsiline seade (inventory unit) ja selle müüdav konfiguratsioon (puhas funktsioon).
 *
 * Reeglid (vt docs/TECH_SYNC.md):
 *  - Brand (B) või Model (C) värvitud → MÜÜDUD (toon ei loe).
 *  - Tahvelarvutid ja eemaldatava ekraaniga 2-in-1 (detachable) → NOT_LAPTOP (kasutaja otsus 2026-10-12).
 *  - Kohustuslikud: tootja, mudel, Tech ID (D), seerianumber (E), CPU, RAM, salvestus, ekraan, hind (M > 20 €).
 *  - Defekt K/L märkustes → DEFECT; tundmatu märkus → UNKNOWN_NOTE (ei oletata).
 *  - Seisukord on alati B (Techi hinnakirjas seisukorda pole) — ei tuletata värvist, hinnast ega mudelist.
 *  - Hind: M = Techi hinnakirja hind; ostuhind = M − 20 €; meie müügihind = M + 60 € (lõpphind koos KM-ga).
 *  - Puuduv väärtus jääb null-iks (GPU, resolutsioon …); vaikeväärtusi ei leiutata.
 */

export const TECH_SUPPLIER_CODE = "tech";
export const TECH_SOURCE = "TECH";
/** Muuda, kui normaliseerimise loogika muutub — siis uuendab järgmine sync kõik read */
export const TECH_NORMALIZER_VERSION = 1;
/** Techi hinnakirjas seisukorda pole → kõik on B, kuni admin parandab */
export const TECH_GRADE = "B" as const;
/** Techi ostuhind = hinnakirja hind − 20 € */
export const TECH_PURCHASE_DISCOUNT_CENTS = 2_000;
/** Meie müügihind = hinnakirja hind + 60 € (lõpphind koos käibemaksuga) */
export const TECH_SALE_MARKUP_CENTS = 6_000;
/** Füüsiliselt tarnija laos → tarne 1–2 tööpäeva (pakkumise tasemel tarneaeg, mitte "Kohe saadaval") */
export const TECH_DELIVERY_DAYS = { min: 1, max: 2 } as const;
/** Kasutatud kauba erikord (kasutaja otsus 2026-10-12) — vajalik sooduskoodi marginaalikaitseks */
export const TECH_VAT_SCHEME = "MARGIN" as const;
const MAX_SOURCE_PRICE_CENTS = 2_000_000;

export type TechUnitStatus = "AVAILABLE" | "SOLD" | "NOT_LAPTOP" | "INVALID" | "DEFECT" | "UNKNOWN_NOTE" | "CONFLICT";

export const TECH_STATUS_LABELS: Record<TechUnitStatus | "MISSING", string> = {
  AVAILABLE: "Müügis",
  SOLD: "Müüdud (värvitud)",
  NOT_LAPTOP: "Ei ole sülearvuti",
  INVALID: "Vigased andmed",
  DEFECT: "Defekt",
  UNKNOWN_NOTE: "Tundmatu märkus",
  CONFLICT: "Andmete konflikt",
  MISSING: "Puudub hinnakirjast",
};

export type TechIssue =
  | "UNKNOWN_BRAND"
  | "MISSING_MODEL"
  | "MISSING_ID"
  | "MISSING_SERIAL"
  | "MISSING_CPU"
  | "INVALID_RAM"
  | "INVALID_STORAGE"
  /** Salvestuse tüüp pole "SSD" (puudub või HDD) — pood kuvab kõikjal SSD, seega ei väideta seda (ei leiutata) */
  | "STORAGE_NOT_SSD"
  | "INVALID_DISPLAY"
  | "INVALID_PRICE";

export interface TechConfig {
  model: ModelRef;
  cpu: string;
  cpuFamily: string | null;
  cpuGeneration: string | null;
  ramGb: number;
  storageGb: number;
  storageType: "SSD" | "HDD" | null;
  screenSizeIn: number;
  resolution: string | null;
  resolutionLabel: string | null;
  panel: string | null;
  touchscreen: boolean;
  gpu: string | null;
  gpuDedicated: boolean | null;
  features: TechNoteFeatures;
  /** Hinnakirja hind (M) sentides */
  sourcePriceCents: number;
}

export interface TechUnit {
  sheet: string;
  rowNumber: number;
  /** Kehtiv Tech ID (D) või null */
  externalUnitId: string | null;
  serial: string | null;
  status: TechUnitStatus;
  /** Inimloetavad põhjused (adminile) */
  reasons: string[];
  issues: TechIssue[];
  soldByColor: boolean;
  notes: TechNoteResult;
  /** Kehtiv konfiguratsioon (null, kui andmed on vigased) */
  config: TechConfig | null;
  source: TechSourceRow;
}

/** Tahvlid/detachable'id: jagatud reegel (src/integrations/supplier/form-factor.ts) */
export { isNotLaptop } from "@/integrations/supplier/form-factor";

const SERIES_CASING: Record<string, string> = { thinkpad: "ThinkPad", zbook: "ZBook", expertbook: "ExpertBook", vivobook: "VivoBook", thinkbook: "ThinkBook" };

/** Techi mudelinime kirjapildi ühtlustamine enne jagatud kanoonilist kuju: "10th Gen" → "Gen 10", "Thinkpad" → "ThinkPad" */
export function techModelName(raw: string): string {
  return raw
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b(\d{1,2})(?:st|nd|rd|th)\s+gen\b/gi, "Gen $1")
    .replace(/^(\S+)/, (word) => SERIES_CASING[word.toLowerCase()] ?? word);
}

/** "i5-1135G7" → "Intel Core i5-1135G7"; muu jääb tarnija kujule (puhastatud) */
export function normalizeTechCpu(raw: string): string {
  const text = raw.replace(/\s+/g, " ").trim();
  if (/^i[3579]-\d{4,5}[a-z0-9]*$/i.test(text)) return `Intel Core ${text[0].toLowerCase()}${text.slice(1)}`;
  if (/^ryzen\s/i.test(text)) return `AMD ${text}`;
  return text;
}

/** G veerg: RAM megabaitides ("16384") või "16GB" → GB. Muu (nt "4" — ühik ebaselge) → null. */
export function parseTechRamGb(raw: string | null): number | null {
  if (!raw) return null;
  const text = raw.replace(/\s+/g, "");
  if (/^\d+$/.test(text)) {
    const mb = Number(text);
    return mb >= 1024 && mb <= 262_144 && mb % 1024 === 0 ? mb / 1024 : null;
  }
  const gb = text.match(/^(\d{1,3})GB$/i);
  return gb && Number(gb[1]) > 0 ? Number(gb[1]) : null;
}

/** H veerg: "256 SSD", "500", "2 x 500 SSD" → { gb, type } */
export function parseTechStorage(raw: string | null): { gb: number; type: "SSD" | "HDD" | null } | null {
  if (!raw) return null;
  const text = raw.replace(/\s+/g, " ").trim();
  const single = text.match(/^(\d{2,5})\s*(?:GB\s*)?(SSD|HDD)?$/i);
  const multi = text.match(/^(\d)\s*x\s*(\d{2,5})\s*(?:GB\s*)?(SSD|HDD)?$/i);
  const gb = single ? Number(single[1]) : multi ? Number(multi[1]) * Number(multi[2]) : null;
  const type = (single?.[2] ?? multi?.[3])?.toUpperCase() as "SSD" | "HDD" | undefined;
  return gb && gb >= 16 && gb <= 16_384 ? { gb, type: type ?? null } : null;
}

/** I veerg: 'W14"', "W15''", '13"' → 14 */
export function parseTechScreenSize(raw: string | null): number | null {
  if (!raw) return null;
  const match = raw.replace(/\s+/g, "").match(/^W?(\d{1,2}(?:[.,]\d)?)(?:"|''|”|″|inch)?$/i);
  if (!match) return null;
  const size = Number(match[1].replace(",", "."));
  return size >= 7 && size <= 19 ? size : null;
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

/** J veerg: "1920x1080 IPS Touchscreen" → resolutsioon, paneel, puutetundlikkus */
export function parseTechResolution(raw: string | null): { resolution: string | null; resolutionLabel: string | null; panel: string | null; touchscreen: boolean } {
  const text = raw ?? "";
  const match = text.match(/(\d{3,4})\s*[x×]\s*(\d{3,4})/);
  const resolution = match ? `${match[1]}x${match[2]}` : null;
  return {
    resolution,
    resolutionLabel: resolution ? (RESOLUTION_LABELS[resolution] ?? null) : null,
    panel: text.match(/\b(IPS|OLED|TN|VA)\b/i)?.[1].toUpperCase() ?? null,
    touchscreen: /touch/i.test(text),
  };
}

/** M veerg: "380" / "380.5" → sentides; puudub, pole number või ≤ 20 € → null */
export function parseTechPriceCents(raw: string | null): number | null {
  if (!raw) return null;
  const match = raw.trim().replace(",", ".").match(/^(\d{1,6})(?:\.(\d{1,2}))?$/);
  if (!match) return null;
  const cents = Number(match[1]) * 100 + Number((match[2] ?? "0").padEnd(2, "0"));
  return cents > TECH_PURCHASE_DISCOUNT_CENTS && cents <= MAX_SOURCE_PRICE_CENTS ? cents : null;
}

export function techPurchasePriceCents(sourcePriceCents: number): number {
  return sourcePriceCents - TECH_PURCHASE_DISCOUNT_CENTS;
}

export function techSalePriceCents(sourcePriceCents: number): number {
  return sourcePriceCents + TECH_SALE_MARKUP_CENTS;
}

/** Tech ID (D): ainult numbrid (5–9 kohta). Seerianumber D veerus (nihkunud read) → kehtetu. */
export function parseTechUnitId(raw: string | null): string | null {
  const text = raw?.trim() ?? "";
  return /^\d{5,9}$/.test(text) ? text : null;
}

const DEDICATED_GPU = /\b(nvidia|geforce|quadro|rtx|radeon\s+pro|radeon\s+rx|firepro)\b/i;

const GPU_WORD_CASING: Record<string, string> = { intel: "Intel", iris: "Iris", xe: "Xe", uhd: "UHD", hd: "HD", plus: "Plus", pro: "Pro", amd: "AMD", radeon: "Radeon", nvidia: "Nvidia", geforce: "GeForce", quadro: "Quadro", rtx: "RTX" };

/**
 * GPU tekst ühtlustatult: ®/™, lõpu-"Graphics" ja korduvad tühikud eemaldatud, tuntud sõnade kirjapilt ühtlustatud
 * ("Intel® Iris® Xe Graphics" = "Intel iris Xe" = "Intel Iris Xe"). Tühi → null.
 */
export function normalizeTechGpu(raw: string | null): string | null {
  const text = raw
    ?.replace(/[®™]/g, "")
    .replace(/\s+graphics$/i, "")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b[a-z]+\b/gi, (word) => GPU_WORD_CASING[word.toLowerCase()] ?? word);
  return text ? text : null;
}

export function normalizeTechRow(source: TechSourceRow): TechUnit {
  const notes = classifyTechNotes([source.noteK, source.noteL]);
  const issues: TechIssue[] = [];
  const reasons: string[] = [];

  const externalUnitId = parseTechUnitId(source.techId);
  if (!externalUnitId) issues.push("MISSING_ID");
  const serial = source.serial?.trim() || null;
  if (!serial || serial.length < 4 || serial === source.techId?.trim()) issues.push("MISSING_SERIAL");

  let model: ModelRef | null = null;
  if (!source.model || source.model === "-") issues.push("MISSING_MODEL");
  else {
    try {
      model = resolveModelRef(source.brand ?? "", techModelName(source.model));
    } catch (error) {
      if (!(error instanceof ModelResolutionError)) throw error;
      issues.push(source.brand ? "UNKNOWN_BRAND" : "MISSING_MODEL");
    }
  }
  const cpuRaw = source.processor?.trim() || null;
  if (!cpuRaw) issues.push("MISSING_CPU");
  const ramGb = parseTechRamGb(source.ram);
  if (ramGb === null) issues.push("INVALID_RAM");
  const storage = parseTechStorage(source.storage);
  if (!storage) issues.push("INVALID_STORAGE");
  else if (storage.type !== "SSD") issues.push("STORAGE_NOT_SSD");
  const screenSizeIn = parseTechScreenSize(source.display);
  if (screenSizeIn === null) issues.push("INVALID_DISPLAY");
  const sourcePriceCents = parseTechPriceCents(source.price);
  if (sourcePriceCents === null) issues.push("INVALID_PRICE");

  const config: TechConfig | null =
    model && cpuRaw && ramGb !== null && storage && screenSizeIn !== null && sourcePriceCents !== null
      ? (() => {
          const cpu = normalizeTechCpu(cpuRaw);
          const parsedCpu = parseCpu(cpu);
          const display = parseTechResolution(source.resolution);
          const gpu = normalizeTechGpu(source.video);
          return {
            model,
            cpu,
            cpuFamily: parsedCpu.family,
            cpuGeneration: parsedCpu.generationKey,
            ramGb,
            storageGb: storage.gb,
            storageType: storage.type,
            screenSizeIn,
            ...display,
            gpu,
            gpuDedicated: gpu ? DEDICATED_GPU.test(gpu) : null,
            features: notes.features,
            sourcePriceCents,
          };
        })()
      : null;

  let status: TechUnitStatus;
  if (source.colored) {
    status = "SOLD";
    reasons.push(`Brand/Model lahter värvitud (${source.brandFill ?? source.modelFill ?? "?"})`);
  } else if (isNotLaptop(source.model ?? "", screenSizeIn)) {
    status = "NOT_LAPTOP";
    reasons.push("Tahvelarvuti või eemaldatava ekraaniga 2-in-1 — ei ole sülearvuti");
  } else if (issues.length) {
    status = "INVALID";
    reasons.push(`Vigased/puuduvad andmed: ${issues.join(", ")}`);
  } else if (notes.defects.length) {
    status = "DEFECT";
    reasons.push(`Defekt: ${notes.defects.map((d) => TECH_DEFECT_LABELS[d]).join(", ")}`);
  } else if (notes.unknown.length) {
    status = "UNKNOWN_NOTE";
    reasons.push(`Tundmatu märkus: ${notes.unknown.join(" ")}`);
  } else {
    status = "AVAILABLE";
  }

  return { sheet: source.sheet, rowNumber: source.rowNumber, externalUnitId, serial, status, reasons, issues, soldByColor: source.colored, notes, config, source };
}

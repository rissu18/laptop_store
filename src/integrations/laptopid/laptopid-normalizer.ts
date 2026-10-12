import { LIGHT_LAPTOP_MAX_KG } from "@/domain/catalog/features";
import type { ListingDetails } from "@/domain/catalog/listing-details";
import type { CpuFamily, FeatureFlags, KeyboardLayout } from "@/domain/catalog/types";
import { parseSupplierGrade, type GradeCode } from "@/domain/grade/grades";
import { ModelResolutionError, resolveModelRef, type ModelRef } from "@/integrations/supplier/model-resolver";
import { parseCpu, parseDisplay, parseKeyboardLayout, parseRam, parseStorageGb } from "@/integrations/supplier/spec-parsers";
import { htmlToText } from "./html-text";
import type { LaptopidImage, LaptopidProduct } from "./laptopid-schema";

/**
 * Laptopid.ee toode → meie normaliseeritud pakkumine (puhas funktsioon, ilma andmebaasita).
 *
 * Reeglid:
 *  - Identiteet = Laptopid toote `id` (supplier "laptopid" + supplierProductId). Slug EI OLE identiteet.
 *  - Puuduv väärtus jääb null-iks; vaikeväärtusi ei panda (nt Wi-Fi/Bluetooth API-s puudub → null).
 *  - sale_price = müügihind. new_price = "uue hinna" kontekst. Kumbki EI OLE ostuhind (cost jääb NULL).
 *  - Laoseis: toode on aktiivses nimekirjas → saadaval, täpne kogus teadmata (stock NULL).
 *  - Kohustuslikud: tootja, seeria, CPU, RAM, SSD, ekraan, seisukord, müügihind. Puudumisel lükatakse
 *    kirje tagasi (sync logib põhjuse) — poodi ei lähe pooliku infoga toodet.
 */

export const LAPTOPID_SUPPLIER_CODE = "laptopid";
export const LAPTOPID_SOURCE = "LAPTOPID";
/** Muuda, kui normaliseerimise loogika muutub — siis uuendab järgmine sync kõik read (ka sama toorandmetega). */
export const LAPTOPID_NORMALIZER_VERSION = 2;

const IMAGE_HOST = "laptopid.ee";
const IMAGE_PATH = /^\/images\/product\/+(\d+)\/(\d+)\/original\.(png|jpe?g|webp)$/i;

export interface LaptopidImageRef {
  sourceId: string;
  position: number;
  thumbnailUrl: string;
  mediumUrl: string;
  largeUrl: string;
}

export type LaptopidModelRef = ModelRef;

export interface LaptopidListingColumns {
  supplierSku: string;
  cpu: string;
  cpuFamily: CpuFamily | null;
  cpuGeneration: string | null;
  ramGb: number;
  ramType: string | null;
  storageGb: number;
  gpu: string | null;
  gpuDedicated: boolean | null;
  screenSizeIn: number;
  resolution: string | null;
  resolutionLabel: string | null;
  panel: string | null;
  touchscreen: boolean;
  keyboard: KeyboardLayout | null;
  grade: GradeCode;
  features: FeatureFlags;
  operatingSystem: string | null;
  warrantyMonths: number | null;
  /** Tarnija müügihind (sale_price) */
  salePriceCents: number;
  weightKg: number | null;
  conditionNotes: string | null;
  details: ListingDetails;
}

export interface LaptopidOffer {
  externalId: string;
  sku: string;
  model: LaptopidModelRef;
  listing: LaptopidListingColumns;
  images: LaptopidImageRef[];
  /** Toorandmed (silumiseks + muutuste tuvastamiseks) */
  raw: LaptopidProduct;
}

export class LaptopidNormalizationError extends Error {}

const fail = (message: string): never => {
  throw new LaptopidNormalizationError(message);
};

/** Laptopid.ee uue/uueväärse kauba klassid → meie "Uus" (NEW). Algne väärtus säilib details.sourceGrade all. */
const LAPTOPID_NEW_GRADES = new Set(["NEW", "DEMO", "OUTLET"]);

export function mapLaptopidGrade(raw: string | null | undefined): GradeCode | null {
  const text = raw?.trim();
  if (!text) return null;
  if (LAPTOPID_NEW_GRADES.has(text.toUpperCase())) return "NEW";
  return parseSupplierGrade(text);
}

export function laptopidExternalId(id: string | number): string {
  return String(id).trim();
}

export function laptopidSku(externalId: string): string {
  return `LP-${externalId}`;
}

/** 0/1 (või "0"/"1", true/false) → boolean; muu → null (teadmata). */
export function flag(value: unknown): boolean | null {
  if (value === 1 || value === "1" || value === true) return true;
  if (value === 0 || value === "0" || value === false) return false;
  return null;
}

function nonNegativeInt(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  return Number.isInteger(n) && n >= 0 && n < 100 ? n : null;
}

function positiveNumber(value: unknown, max: number): number | null {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(String(value).replace(",", "."));
  return Number.isFinite(n) && n > 0 && n <= max ? n : null;
}

/** "749.00" / 749 → 74900 sentides. Ujukomaarvutust ei kasutata. */
export function parsePriceCents(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  const text = String(value).trim().replace(",", ".");
  const match = text.match(/^(\d{1,7})(?:\.(\d{1,2}))?$/);
  if (!match) return null;
  const cents = Number(match[1]) * 100 + Number((match[2] ?? "0").padEnd(2, "0"));
  return cents > 0 ? cents : null;
}

function clean(value: string | null | undefined): string | null {
  const text = value?.replace(/\s+/g, " ").trim();
  return text ? text : null;
}

/** "Intel i5-1235U 4400MHz" → { name: "Intel Core i5-1235U", maxMhz: 4400 } */
export function normalizeCpu(raw: string): { name: string; maxMhz: number | null } {
  let name = raw.replace(/\s+/g, " ").trim();
  let maxMhz: number | null = null;
  const freq = name.match(/\s+(\d+(?:[.,]\d+)?)\s*(MHz|GHz)$/i);
  if (freq) {
    const value = Number(freq[1].replace(",", "."));
    maxMhz = Math.round(freq[2].toLowerCase() === "ghz" ? value * 1000 : value);
    name = name.slice(0, freq.index).trim();
  }
  name = name.replace(/^Intel\s+(?=i[3579]-)/i, "Intel Core ").replace(/^Intel\s+Ultra\b/i, "Intel Core Ultra");
  return { name, maxMhz };
}

const DEDICATED_GPU = /\b(nvidia|geforce|quadro|radeon\s+pro\s+wx|radeon\s+rx)\b/i;

/** Tarnija pildi URL → meie kolm suurust (Laptopid.ee annab small/medium/original). Vigane URL → null. */
export function laptopidImageUrls(imageUrl: string): { thumbnailUrl: string; mediumUrl: string; largeUrl: string } | null {
  let url: URL;
  try {
    url = new URL(imageUrl);
  } catch {
    return null;
  }
  if (url.protocol !== "https:" || url.hostname !== IMAGE_HOST || url.search || url.username) return null;
  const match = url.pathname.match(IMAGE_PATH);
  if (!match) return null;
  const base = `https://${IMAGE_HOST}/images/product/${match[1]}/${match[2]}`;
  return { thumbnailUrl: `${base}/small.${match[3]}`, mediumUrl: `${base}/medium.${match[3]}`, largeUrl: `${base}/original.${match[3]}` };
}

function normalizeImages(images: LaptopidImage[]): LaptopidImageRef[] {
  const seen = new Set<string>();
  return [...images]
    .sort((a, b) => Number(a.sort_order ?? 0) - Number(b.sort_order ?? 0) || Number(a.image_id) - Number(b.image_id))
    .flatMap((image) => {
      const sourceId = String(image.image_id);
      const urls = laptopidImageUrls(image.image_url);
      if (!urls || seen.has(sourceId)) return [];
      seen.add(sourceId);
      return [{ sourceId, ...urls }];
    })
    .map((image, position) => ({ ...image, position }));
}

function safeHttpsUrl(value: string | null | undefined): string | null {
  const text = clean(value);
  if (!text) return null;
  try {
    const url = new URL(text);
    return url.protocol === "https:" ? url.toString() : null;
  } catch {
    return null;
  }
}

/** Tootja + mudel → ProductModel viide (jagatud loogika: integrations/supplier/model-resolver.ts). */
export function resolveLaptopidModel(manufacturer: string, modelName: string): LaptopidModelRef {
  try {
    return resolveModelRef(manufacturer, modelName);
  } catch (error) {
    if (error instanceof ModelResolutionError) fail(error.message);
    throw error;
  }
}

export function normalizeLaptopidProduct(product: LaptopidProduct, images: LaptopidImage[]): LaptopidOffer {
  const externalId = laptopidExternalId(product.id);
  const model = resolveLaptopidModel(product.manufacturer, product.model);

  const cpuRaw = clean(product.cpu) ?? fail("CPU puudub");
  const cpu = normalizeCpu(cpuRaw);
  const cpuParsed = parseCpu(cpu.name);
  const ram = parseRam(product.ram ?? "") ?? fail(`RAM-i ei õnnestunud lugeda: ${product.ram ?? ""}`);
  const storageGb = parseStorageGb(product.storage ?? "") ?? fail(`Salvestust ei õnnestunud lugeda: ${product.storage ?? ""}`);
  const display = parseDisplay(product.screen ?? "") ?? fail(`Ekraani ei õnnestunud lugeda: ${product.screen ?? ""}`);
  const sourceGrade = clean(product.grade);
  const grade = mapLaptopidGrade(sourceGrade) ?? fail(`Tundmatu seisukord: ${sourceGrade ?? "(puudub)"}`);
  const salePriceCents = parsePriceCents(product.sale_price) ?? fail(`Vigane müügihind: ${String(product.sale_price)}`);

  const gpu = clean(product.gpu);
  const gpuDedicated = gpu ? DEDICATED_GPU.test(gpu) : null;
  const os = clean(product.os);
  const weightKg = positiveNumber(product.weight, 6);
  const usbC = nonNegativeInt(product.usb_c);
  const usb2 = nonNegativeInt(product.usb_2);
  const usb3 = nonNegativeInt(product.usb_3);
  const usbA = usb2 === null && usb3 === null ? null : (usb2 ?? 0) + (usb3 ?? 0);
  const tb3 = flag(product.thunderbolt_3);
  const tb4 = flag(product.thunderbolt_4);
  const thunderbolt = tb3 === null && tb4 === null ? null : Boolean(tb3) || Boolean(tb4);
  const refreshRate = nonNegativeIntInRange(product.refresh_rate, 30, 500);
  const keyboardRaw = clean(product.keyboard_layout);
  const keyboard = parseKeyboardLayout(keyboardRaw);

  const features: FeatureFlags = {
    touch: display.touch,
    convertible: flag(product.yoga),
    numpad: flag(product.numpad),
    backlit: flag(product.backlit_keyboard),
    fingerprint: flag(product.fingerprint_reader),
    "ir-camera": flag(product.ir_camera),
    smartcard: flag(product.smartcard_reader),
    lte: flag(product.mobile_4g),
    // API ei ütle 5G kohta midagi → teadmata
    "5g": null,
    thunderbolt,
    "usb-c": usbC === null ? null : usbC > 0,
    hdmi: flag(product.hdmi),
    lan: flag(product.lan),
    "sd-reader": flag(product.sd_card_reader),
    "dedicated-gpu": gpuDedicated,
    "nvidia-rtx": gpu ? gpuDedicated === true && /RTX/i.test(gpu) : null,
    "windows-11": os ? /windows 11/i.test(os) : null,
    light: weightKg !== null ? weightKg <= LIGHT_LAPTOP_MAX_KG : null,
  };

  const details: ListingDetails = {
    source: LAPTOPID_SOURCE,
    sourceGrade,
    usbA,
    usbC,
    thunderbolt: tb3 && tb4 ? "3+4" : tb4 ? "4" : tb3 ? "3" : null,
    displayPort: flag(product.displayport),
    vga: flag(product.vga),
    dvi: flag(product.dvi),
    webcam: flag(product.webcam),
    pointingStick: flag(product.pointing_stick),
    dockingSupport: flag(product.docking_support),
    privacyScreen: flag(product.privacy_screen),
    refreshRateHz: refreshRate,
    cpuMaxMhz: cpu.maxMhz,
    keyboardRaw: keyboard ? null : keyboardRaw,
    batteryHours: positiveNumber(product.battery_hours, 48),
    videoOutputs: clean(product.video_outputs),
    portsText: htmlToText(product.ports, 500),
    pointingDevice: clean(product.mouse),
    pdfUrl: safeHttpsUrl(product.pdf_url),
    newPriceCents: parsePriceCents(product.new_price),
    upstreamSlug: clean(product.slug),
  };

  return {
    externalId,
    sku: laptopidSku(externalId),
    model,
    listing: {
      supplierSku: externalId,
      cpu: cpu.name,
      cpuFamily: cpuParsed.family,
      cpuGeneration: cpuParsed.generationKey,
      ramGb: ram.gb,
      ramType: ram.type,
      storageGb,
      gpu,
      gpuDedicated,
      screenSizeIn: display.sizeIn,
      resolution: display.resolution,
      resolutionLabel: display.resolutionLabel,
      panel: display.panel,
      touchscreen: display.touch,
      keyboard,
      grade,
      features,
      operatingSystem: os,
      warrantyMonths: nonNegativeIntInRange(product.guarantee, 1, 120),
      salePriceCents,
      weightKg,
      conditionNotes: htmlToText(product.defects, 1000),
      details,
    },
    images: normalizeImages(images),
    raw: product,
  };
}

function nonNegativeIntInRange(value: unknown, min: number, max: number): number | null {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  return Number.isInteger(n) && n >= min && n <= max ? n : null;
}

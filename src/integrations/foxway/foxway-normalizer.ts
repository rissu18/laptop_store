import { chargerDecision, type ChargerDecision } from "@/domain/catalog/charger";
import { normalizeKeyboard, type KeyboardNormalization } from "@/domain/catalog/keyboard";
import { parseSupplierGrade, type GradeCode } from "@/domain/grade/grades";
import { isNotLaptop } from "@/integrations/supplier/form-factor";
import { ModelResolutionError, resolveModelRef, type ModelRef } from "@/integrations/supplier/model-resolver";
import { parseCpu, parseRam, parseStorageGb } from "@/integrations/supplier/spec-parsers";
import type { QualityHold } from "@/server/db/schema";
import { assessCondition, type ConditionAssessment } from "./foxway-faults";
import { parseFoxwayProductName, type ParsedProductName } from "./foxway-names";
import { FOXWAY_CURRENCY, foxwayEffectiveSupplierPriceCents, foxwaySalePrice, type FoxwayPrice } from "./foxway-pricing";
import { FOXWAY_DIMENSION_KEYS, dimensionMap, type FoxwayCatalogSlug, type FoxwayFeedKey, type FoxwayLine } from "./foxway-schema";

/**
 * Foxway hinnakirja rida → normaliseeritud müüdav konfiguratsioon (puhas funktsioon, vt docs/FOXWAY_SYNC.md).
 *
 * - Identiteet = SKU (mitte ItemVariantId ega mudelinimi).
 * - Puuduv väärtus jääb null-iks — vaikeväärtusi ei leiutata.
 * - Seisukord tuleb Appearance'ist (mitte kataloogist): Brand New → NEW ("Uus"), Grade A+/A/B/C+/C → sama klass.
 * - Ohutus (`hold`): rikked (mõlemad väljad), Functionality, tundmatu seisukord, puuduv klaviatuur, tahvel, mitte-EUR,
 *   mitte-SSD, tundmatu Boxed → REVIEW/BLOCKED (poes ei kuvata, admin näeb põhjust).
 */

export const FOXWAY_SUPPLIER_CODE = "foxway";
export const FOXWAY_SOURCE = "FOXWAY";
/** Muuda, kui normaliseerimise loogika muutub — siis uuendab järgmine sync kõik read */
export const FOXWAY_NORMALIZER_VERSION = 1;
/** Foxway Tartu ladu → meie Tallinna pood → kuller → klient */
export const FOXWAY_DELIVERY_DAYS = { min: 2, max: 4 } as const;
/** Meie garantii kliendile (Foxway tarnijagarantii EI OLE kliendi garantii); pikem mudeli garantii jääb kehtima */
export const FOXWAY_MIN_WARRANTY_MONTHS = 12;
export const FOXWAY_BATTERY_WARRANTY_MONTHS = 6;
/** KM režiim SKU kaupa: IsVatMargin → kasutatud kauba erikord (MARGIN), muidu hinnas täis-KM (STANDARD) */
export function foxwayVatScheme(isVatMargin: boolean | null): "STANDARD" | "MARGIN" {
  return isVatMargin === true ? "MARGIN" : "STANDARD";
}

export interface FoxwaySourceLine {
  feed: FoxwayFeedKey;
  catalog: FoxwayCatalogSlug;
  line: FoxwayLine;
}

/** Foxway Dimension toorväärtused (null = tarnija ei andnud) */
export interface FoxwayDims {
  color: string | null;
  appearance: string | null;
  functionality: string | null;
  boxed: string | null;
  cpu: string | null;
  ram: string | null;
  drive: string | null;
  battery: string | null;
  keyboard: string | null;
  coa: string | null;
  lcd: string | null;
  gpu: string | null;
  faultPrimary: string | null;
  faultAdditional: string | null;
}

export function foxwayDims(line: FoxwayLine): FoxwayDims {
  const map = dimensionMap(line);
  return Object.fromEntries(Object.entries(FOXWAY_DIMENSION_KEYS).map(([key, foxwayKey]) => [key, map[foxwayKey] ?? null])) as unknown as FoxwayDims;
}

export interface FoxwayOffer {
  sku: string;
  itemVariantId: string | null;
  productName: string;
  quantity: number;
  /** Tarnija hinnakirja hind sentides (API Price × 100) */
  sourcePriceCents: number;
  currency: string;
  isVatMargin: boolean | null;
  ean: string | null;
  mpn: string | null;
  itemGroupId: number | null;
  dims: FoxwayDims;
  name: ParsedProductName;
  model: ModelRef;
  grade: GradeCode | null;
  cpu: string | null;
  cpuFamily: string | null;
  cpuGeneration: string | null;
  ramGb: number | null;
  storageGb: number | null;
  storageType: "SSD" | "HDD" | null;
  /** Lisaketas, nt "1TB HDD" (pood kuvab põhiketta) */
  secondaryStorage: string | null;
  gpu: string | null;
  gpuDedicated: boolean | null;
  resolution: string | null;
  resolutionLabel: string | null;
  touchscreen: boolean | null;
  keyboard: KeyboardNormalization;
  operatingSystem: string | null;
  features: Record<string, boolean | null>;
  condition: ConditionAssessment;
  charger: ChargerDecision;
  /** null, kui valuuta pole EUR (automaatset hinda ei arvutata) */
  price: FoxwayPrice | null;
  hold: QualityHold | null;
  holdReasons: string[];
}

export type FoxwayRowResult =
  | { kind: "OFFER"; offer: FoxwayOffer }
  | { kind: "INVALID"; sku: string | null; productName: string | null; reasons: string[] };

/** Appearance → meie klass. Tundmatu → null (ja hold). */
export function mapFoxwayAppearance(raw: string | null): { grade: GradeCode | null; hold: QualityHold | null; reason: string | null } {
  if (!raw) return { grade: null, hold: "REVIEW", reason: "Appearance (seisukord) puudub" };
  if (/^brand\s*new$/i.test(raw.trim())) return { grade: "NEW", hold: null, reason: null };
  const grade = parseSupplierGrade(raw);
  if (grade && grade !== "NEW") return { grade, hold: null, reason: null };
  // Katkised/puudulikud klassid (D, E, NP, Incomplete …) — ei impordita poodi
  if (/grade\s*[d-z]\b|^[d-z]$|\bnp\b|incomplete|broken|scrap|parts/i.test(raw)) return { grade: null, hold: "BLOCKED", reason: `Seisukord "${raw}" — katkine/puudulik klass, ei müüda` };
  return { grade: null, hold: "REVIEW", reason: `Tundmatu seisukord "${raw}"` };
}

/** "Core i5-1135G7" → "Intel Core i5-1135G7"; "Ryzen 5 3500U" → "AMD Ryzen 5 3500U"; "Apple M2 Pro 12-Core" jääb */
export function normalizeFoxwayCpu(raw: string | null): string | null {
  const text = raw?.replace(/\s+/g, " ").trim();
  if (!text) return null;
  if (/^(core|celeron|pentium|xeon|atom)\b/i.test(text)) return `Intel ${text}`;
  if (/^(ryzen|athlon)\b/i.test(text)) return `AMD ${text}`;
  if (/^snapdragon\b/i.test(text)) return `Qualcomm ${text}`;
  return text;
}

/** "Integrated" → null; "GeForce RTX 4060 8GB" → NVIDIA, eraldi; "Iris Plus 655 1.5GB shared" → integreeritud */
export function normalizeFoxwayGpu(raw: string | null): { gpu: string | null; dedicated: boolean | null; untested: boolean } {
  const text = raw?.replace(/\s+/g, " ").trim();
  if (!text) return { gpu: null, dedicated: null, untested: false };
  if (/^integrated$/i.test(text)) return { gpu: null, dedicated: false, untested: false };
  if (/^not\s*tested$/i.test(text)) return { gpu: null, dedicated: null, untested: true };
  if (/\bshared\b/i.test(text)) {
    const base = text.replace(/\s*\d+(?:\.\d+)?\s*GB\s+shared\b/i, "").trim();
    return { gpu: /^(iris|u?hd)\b/i.test(base) ? `Intel ${base}` : base, dedicated: false, untested: false };
  }
  if (/^(iris|u?hd\s+graphics|uhd|hd)\b/i.test(text)) return { gpu: `Intel ${text}`, dedicated: false, untested: false };
  const nvidia = text.replace(/^geforce\b/i, "GeForce");
  if (/^(geforce|quadro|rtx|gtx|mx\d)/i.test(nvidia)) return { gpu: `NVIDIA ${nvidia}`, dedicated: true, untested: false };
  if (/^\d{3}M$/i.test(text)) return { gpu: `NVIDIA GeForce ${text.toUpperCase()}`, dedicated: true, untested: false };
  if (/^radeon\b/i.test(text)) return { gpu: `AMD ${text}`, dedicated: true, untested: false };
  return { gpu: text, dedicated: null, untested: false };
}

/** "FHD (1920x1080)" → 1920x1080 + FHD; "2496x1664" → ilma sildita; "Retina" → resolutsioon teadmata, silt Retina */
export function parseFoxwayResolution(raw: string | null): { resolution: string | null; resolutionLabel: string | null } {
  const text = raw?.replace(/\s+/g, " ").trim();
  if (!text) return { resolution: null, resolutionLabel: null };
  const size = text.match(/(\d{3,4})\s*[x×]\s*(\d{3,4})/);
  const label = text.replace(/\(?\s*\d{3,4}\s*[x×]\s*\d{3,4}\s*\)?/, "").trim();
  return { resolution: size ? `${size[1]}x${size[2]}` : null, resolutionLabel: label || null };
}

/** "256GB SSD + 1TB HDD" → põhiketas SSD 256 + lisaketas; "1TB HDD" → HDD (pood kuvab SSD → ülevaatus) */
export function parseFoxwayDrive(raw: string | null): { storageGb: number | null; storageType: "SSD" | "HDD" | null; secondary: string | null } {
  const text = raw?.replace(/\s+/g, " ").trim();
  if (!text) return { storageGb: null, storageType: null, secondary: null };
  const parts = text.split("+").map((p) => p.trim()).filter(Boolean);
  const ssd = parts.find((p) => /\bSSD\b/i.test(p));
  if (ssd) {
    const secondary = parts.filter((p) => p !== ssd).join(" + ") || null;
    return { storageGb: parseStorageGb(ssd), storageType: "SSD", secondary };
  }
  const first = parts[0];
  return { storageGb: parseStorageGb(first), storageType: /\bHDD\b/i.test(first) ? "HDD" : null, secondary: parts.slice(1).join(" + ") || null };
}

/** COA → operatsioonisüsteem; "Missing" (litsentsi pole) → null */
export function normalizeFoxwayOs(raw: string | null): string | null {
  const text = raw?.replace(/\s+/g, " ").trim();
  if (!text || /^missing$/i.test(text)) return null;
  const win = text.match(/^win(?:dows)?\s*(\d{2})?\s*(home|pro)?/i);
  if (win) return ["Windows", win[1], win[2] ? win[2][0].toUpperCase() + win[2].slice(1).toLowerCase() : null].filter(Boolean).join(" ");
  if (/^mac\s*os$/i.test(text)) return "macOS";
  return text;
}

/** Foxway hind (eurod, kuni 2 komakohta) → sendid; vigane → null */
function priceCents(price: number | null | undefined): number | null {
  if (typeof price !== "number" || !Number.isFinite(price) || price <= 0 || price > 100_000) return null;
  return Math.round(price * 100);
}

export function normalizeFoxwayLine(source: FoxwaySourceLine): FoxwayRowResult {
  const { line } = source;
  const sku = line.SKU?.trim() || null;
  const productName = line.ProductName?.trim() || null;
  const reasons: string[] = [];
  const validSku = sku !== null && /^[A-Za-z0-9._-]{3,64}$/.test(sku);
  if (!sku) reasons.push("SKU puudub");
  else if (!validSku) reasons.push(`SKU vigasel kujul ("${sku.slice(0, 40)}")`);
  if (!productName) reasons.push("ProductName puudub");
  const quantity = line.Quantity;
  if (typeof quantity !== "number" || !Number.isInteger(quantity) || quantity < 0 || quantity > 100_000) reasons.push(`Quantity vigane (${String(quantity)})`);
  const sourcePriceCents = priceCents(line.Price);
  if (sourcePriceCents === null) reasons.push(`Price vigane (${String(line.Price)})`);
  // Vigane rida: kehtiva SKU-ga rida loetakse "nähtuks" (olemasolevat pakkumist ei võeta maha, vaid pannakse ülevaatusele)
  if (reasons.length) return { kind: "INVALID", sku: validSku ? sku : null, productName, reasons };

  const name = parseFoxwayProductName(productName!);
  let model: ModelRef;
  try {
    model = resolveModelRef(name.brand, name.modelName);
  } catch (error) {
    if (!(error instanceof ModelResolutionError)) throw error;
    return { kind: "INVALID", sku, productName, reasons: [`Mudelit ei saa määrata: ${error.message}`] };
  }

  const dims = foxwayDims(line);
  const holds: { hold: QualityHold; reason: string }[] = [];

  const appearance = mapFoxwayAppearance(dims.appearance);
  if (appearance.hold) holds.push({ hold: appearance.hold, reason: appearance.reason! });

  const condition = assessCondition({ functionality: dims.functionality, primaryFault: dims.faultPrimary, additionalFault: dims.faultAdditional });
  if (condition.severity === "BLOCK") for (const reason of condition.reasons) holds.push({ hold: "BLOCKED", reason });
  else if (condition.severity === "REVIEW") for (const reason of condition.reasons) holds.push({ hold: "REVIEW", reason });

  const keyboard = normalizeKeyboard(dims.keyboard);
  if (keyboard.missing) holds.push({ hold: "BLOCKED", reason: `Klaviatuur puudub ("${dims.keyboard}")` });

  if (isNotLaptop(`${model.series} ${model.model}`, name.screenSizeIn)) holds.push({ hold: "BLOCKED", reason: "Tahvelarvuti või eemaldatava ekraaniga 2-in-1 — ei ole sülearvuti (sama reegel mis Techil)" });

  const currency = line.CurrencyIsoCode?.trim().toUpperCase() || null;
  if (currency !== FOXWAY_CURRENCY) holds.push({ hold: "REVIEW", reason: `Valuuta ${currency ?? "puudub"} — automaatne hind ainult EUR-is (konverteerimise reeglit pole)` });

  const cpu = normalizeFoxwayCpu(dims.cpu);
  const parsedCpu = cpu ? parseCpu(cpu) : { family: null, generationKey: null };
  const ramGb = dims.ram ? (parseRam(dims.ram)?.gb ?? null) : null;
  const drive = parseFoxwayDrive(dims.drive);
  if (drive.storageGb !== null && drive.storageType !== "SSD") holds.push({ hold: "REVIEW", reason: `Põhiketas ei ole SSD ("${dims.drive}") — pood kuvab SSD` });
  const missing = [!cpu && "CPU", ramGb === null && "RAM", drive.storageGb === null && "Drive", name.screenSizeIn === null && "ekraani suurus"].filter(Boolean);
  if (missing.length) holds.push({ hold: "REVIEW", reason: `Puuduvad andmed: ${missing.join(", ")}` });

  const gpu = normalizeFoxwayGpu(dims.gpu);
  if (gpu.untested) holds.push({ hold: "REVIEW", reason: `Graafika "${dims.gpu}" — testimata` });

  const charger = chargerDecision(dims.boxed, { brand: model.brand, series: model.series, model: model.model, gpu: gpu.gpu, gpuDedicated: gpu.dedicated, screenSizeIn: name.screenSizeIn });
  if (charger.boxed === "UNKNOWN") holds.push({ hold: "REVIEW", reason: `Tundmatu Boxed väärtus "${dims.boxed ?? "–"}" — laadija lisatasu kontrollida` });

  const isVatMargin = typeof line.IsVatMargin === "boolean" ? line.IsVatMargin : null;
  const price = currency === FOXWAY_CURRENCY ? foxwaySalePrice(foxwayEffectiveSupplierPriceCents(sourcePriceCents!), charger.surchargeCents, { vatMargin: isVatMargin === true }) : null;

  const display = parseFoxwayResolution(dims.lcd);
  const operatingSystem = normalizeFoxwayOs(dims.coa);
  const fullName = `${model.series} ${model.model}`;
  const features: Record<string, boolean | null> = {
    touch: name.touch ? true : null,
    convertible: /\bx360\b|\bflip\b|\b2-in-1\b|\b360\b/i.test(fullName) ? true : null,
    "5g": name.fiveG ? true : null,
    "dedicated-gpu": gpu.dedicated,
    "nvidia-rtx": gpu.gpu ? gpu.dedicated === true && /\bRTX\b/i.test(gpu.gpu) : null,
    "windows-11": operatingSystem ? (/Windows 11/.test(operatingSystem) ? true : null) : null,
  };

  const hold: QualityHold | null = holds.some((h) => h.hold === "BLOCKED") ? "BLOCKED" : holds.length ? "REVIEW" : null;
  return {
    kind: "OFFER",
    offer: {
      sku: sku!,
      itemVariantId: typeof line.ItemVariantId === "number" ? String(line.ItemVariantId) : null,
      productName: productName!,
      quantity: quantity as number,
      sourcePriceCents: sourcePriceCents!,
      currency: currency ?? "",
      isVatMargin,
      ean: line.Ean ?? null,
      mpn: line.Mpn ?? null,
      itemGroupId: line.ItemGroupId ?? null,
      dims,
      name,
      model,
      grade: appearance.grade,
      cpu,
      cpuFamily: parsedCpu.family,
      cpuGeneration: parsedCpu.generationKey,
      ramGb,
      storageGb: drive.storageGb,
      storageType: drive.storageType,
      secondaryStorage: drive.secondary,
      gpu: gpu.gpu,
      gpuDedicated: gpu.dedicated,
      ...display,
      touchscreen: name.touch ? true : null,
      keyboard,
      operatingSystem,
      features,
      condition,
      charger,
      price,
      hold,
      holdReasons: [...new Set(holds.map((h) => h.reason))],
    },
  };
}

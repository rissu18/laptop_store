/**
 * Protsessori perekond ja põlvkond — ÜKS parser kogu poe jaoks (tarnijate sync'id + poe filter).
 *
 * `parseCpuInfo` tuletab väärtused CPU nimest. Sync'id salvestavad tulemuse andmebaasi (`cpu_family`,
 * `cpu_generation`); admini parandus (`manual_overrides`) võidab alati. Poe filter eelistab andmebaasi väärtust ja
 * kasutab parserit ainult siis, kui see puudub. Kui nimest ei saa kindlalt tuletada (Intel N100, AMD A10-8700B,
 * "AMD Ryzen 7" ilma mudelinumbrita), jääb väärtus NULL-iks — ei arvata.
 *
 * Perekonna võtmed:   intel-core-i5 · intel-core-7 (Core 7 150U) · intel-core-ultra-7 · amd-ryzen-5 · amd-ryzen-ai-7 ·
 *                     apple-m2 · apple-m2-pro · qualcomm-snapdragon-x
 * Põlvkonna võtmed:   intel-13 · core-1 (Intel Core seeria 1) · ultra-2 · amd-7000 (turunduse seeria) · amdai-300 ·
 *                     apple-2 (kiibi põlvkond; Pro/Max on perekonnas, mitte põlvkonnas) · snapdragon-1
 */

export interface CpuInfo {
  model: string;
  family: string | null;
  generationKey: string | null;
}

export interface ParsedCpuInfo {
  family: string | null;
  generationKey: string | null;
}

const APPLE = /\bApple\s+M(\d{1,2})(?:\s+(Pro|Max|Ultra))?\b/i;
// "Intel Core Ultra 7 155H"; tarnija lühem kirjapilt "Ultra 7 165H" (Tech)
const INTEL_ULTRA = /\b(?:Core\s*)?Ultra\s*([579])\s*(\d)\d{2}[a-z]*/i;
// Klassikaline Core i: i5-8350U → 8, i5-10210U → 10, i7-1165G7 → 11, i7-14700HX → 14 (4 numbrit: esimene; 5 / "1xxx": kaks esimest)
const INTEL_CORE = /\bi([3579])[-\s]?(\d{4,5})[a-z0-9]*/i;
// Intel Core ilma "i"-ta (2024+, mitte Ultra): "Core 7 150U", "Core 5 120U" → seeria 1. "Core 3 N355" (N-seeria) EI sobi.
const INTEL_CORE_SERIES = /\bCore\s+([357])\s+([12])\d{2}[a-z]*\b/i;
// Intel Core m3/m5/m7 (Y-seeria): "m7-6Y75" → 6. põlvkond, "Core M3-7Y32" → 7.
const INTEL_CORE_M = /\bm([357])-(\d)Y\d{2}\b/i;
// "AMD Ryzen AI 7 PRO 360" ja tarnija lühem kirjapilt "AMD AI 7 PRO 360"
const AMD_AI = /\bAMD\s+(?:Ryzen\s+)?AI\s*([579])\s*(?:PRO\s*)?(\d)\d{2}\b/i;
// Turunduse seeria (Ryzen 5 7530U → 7000-seeria): poe põlvkonna filter on seeriapõhine, mitte arhitektuuripõhine
const AMD_RYZEN = /\bRyzen\s*([3579])\s*(?:PRO\s*)?(\d)\d{3}[a-z]*/i;
// Qualcomm Snapdragon X (Elite / Plus / X) — Windows on ARM (Foxway). X1E-80-100 / X1P-42-100 / X1-26-100 → 1. põlvkond
const SNAPDRAGON_X = /\bSnapdragon\s+X\b/i;
const SNAPDRAGON_X_CODE = /\bX(\d)[EP]?-\d{2}-\d{3}\b/i;

/** CPU nimi → perekond + põlvkond (ainult nimest; andmebaasi väärtust ei vaata). Tundmatu → null. */
export function parseCpuInfo(raw: string): ParsedCpuInfo {
  const text = raw.replace(/\s+/g, " ").trim();
  const apple = text.match(APPLE);
  if (apple) return { family: `apple-m${apple[1]}${apple[2] ? `-${apple[2].toLowerCase()}` : ""}`, generationKey: `apple-${apple[1]}` };
  const ultra = text.match(INTEL_ULTRA);
  if (ultra) return { family: `intel-core-ultra-${ultra[1]}`, generationKey: `ultra-${ultra[2]}` };
  const core = text.match(INTEL_CORE);
  if (core) {
    const digits = core[2];
    return { family: `intel-core-i${core[1]}`, generationKey: `intel-${digits.startsWith("1") ? Number(digits.slice(0, 2)) : Number(digits[0])}` };
  }
  const series = text.match(INTEL_CORE_SERIES);
  if (series) return { family: `intel-core-${series[1]}`, generationKey: `core-${series[2]}` };
  const coreM = text.match(INTEL_CORE_M);
  if (coreM) return { family: null, generationKey: `intel-${coreM[2]}` };
  const ai = text.match(AMD_AI);
  if (ai) return { family: `amd-ryzen-ai-${ai[1]}`, generationKey: `amdai-${ai[2]}00` };
  const ryzen = text.match(AMD_RYZEN);
  if (ryzen) return { family: `amd-ryzen-${ryzen[1]}`, generationKey: `amd-${ryzen[2]}000` };
  if (SNAPDRAGON_X.test(text)) {
    const code = text.match(SNAPDRAGON_X_CODE);
    return { family: "qualcomm-snapdragon-x", generationKey: code ? `snapdragon-${code[1]}` : null };
  }
  return { family: null, generationKey: null };
}

// ---- Perekond ----------------------------------------------------------------

export function cpuFilterFamily(cpu: CpuInfo): string | null {
  return cpu.family || parseCpuInfo(cpu.model).family;
}

const FAMILY_PATTERN = /^(intel-core-i[3579]|intel-core-[357]|intel-core-ultra-[579]|amd-ryzen-[3579]|amd-ryzen-ai-[579]|apple-m\d{1,2}(-(pro|max|ultra))?|qualcomm-snapdragon-x)$/;

export function isCpuFamilyValue(value: string): boolean {
  return FAMILY_PATTERN.test(value);
}

export function cpuFamilyLabel(value: string): string {
  let m = value.match(/^intel-core-i(\d)$/);
  if (m) return `Intel Core i${m[1]}`;
  m = value.match(/^intel-core-ultra-(\d)$/);
  if (m) return `Intel Core Ultra ${m[1]}`;
  m = value.match(/^intel-core-(\d)$/);
  if (m) return `Intel Core ${m[1]}`;
  m = value.match(/^amd-ryzen-ai-(\d)$/);
  if (m) return `AMD Ryzen AI ${m[1]}`;
  m = value.match(/^amd-ryzen-(\d)$/);
  if (m) return `AMD Ryzen ${m[1]}`;
  m = value.match(/^apple-m(\d+)(?:-(pro|max|ultra))?$/);
  if (m) return `Apple M${m[1]}${m[2] ? ` ${m[2][0].toUpperCase()}${m[2].slice(1)}` : ""}`;
  if (value === "qualcomm-snapdragon-x") return "Qualcomm Snapdragon X";
  return value;
}

const FAMILY_GROUPS = ["intel-core-i", "intel-core-", "intel-core-ultra-", "amd-ryzen-", "amd-ryzen-ai-", "apple-m", "qualcomm-"];
const APPLE_TIERS = ["", "pro", "max", "ultra"];

function familySortKey(value: string): [number, number, number] {
  let m = value.match(/^apple-m(\d+)(?:-(pro|max|ultra))?$/);
  if (m) return [FAMILY_GROUPS.indexOf("apple-m"), Number(m[1]), APPLE_TIERS.indexOf(m[2] ?? "")];
  m = value.match(/^amd-ryzen-ai-(\d)$/);
  if (m) return [FAMILY_GROUPS.indexOf("amd-ryzen-ai-"), Number(m[1]), 0];
  m = value.match(/^amd-ryzen-(\d)$/);
  if (m) return [FAMILY_GROUPS.indexOf("amd-ryzen-"), Number(m[1]), 0];
  m = value.match(/^intel-core-ultra-(\d)$/);
  if (m) return [FAMILY_GROUPS.indexOf("intel-core-ultra-"), Number(m[1]), 0];
  m = value.match(/^intel-core-i(\d)$/);
  if (m) return [FAMILY_GROUPS.indexOf("intel-core-i"), Number(m[1]), 0];
  m = value.match(/^intel-core-(\d)$/);
  if (m) return [FAMILY_GROUPS.indexOf("intel-core-"), Number(m[1]), 0];
  if (value.startsWith("qualcomm-")) return [FAMILY_GROUPS.indexOf("qualcomm-"), 0, 0];
  return [FAMILY_GROUPS.length, 0, 0];
}

/** Tootja kaupa rühmitatud (Intel Core i, Core, Core Ultra, Ryzen, Ryzen AI, Apple, Qualcomm), rühmas tase kasvavalt (i3 → i9, M1 → M4) */
export function compareCpuFamilies(a: string, b: string): number {
  const [ga, na, ta] = familySortKey(a);
  const [gb, nb, tb] = familySortKey(b);
  return ga - gb || na - nb || ta - tb || a.localeCompare(b);
}

// ---- Põlvkond ----------------------------------------------------------------

export function cpuFilterGeneration(cpu: CpuInfo): string | null {
  return cpu.generationKey || parseCpuInfo(cpu.model).generationKey;
}

export function isCpuGenerationValue(value: string): boolean {
  return /^(intel|core|ultra|amd|amdai|apple|snapdragon)-\d{1,4}$/.test(value);
}

/**
 * "intel-12" → "Intel 12. põlvkond", "core-1" → "Intel Core (seeria 1)", "ultra-1" → "Core Ultra (seeria 1)",
 * "amd-5000" → "Ryzen 5000-seeria", "amdai-300" → "Ryzen AI 300-seeria", "apple-2" → "Apple M2", "snapdragon-1" → "Snapdragon X (1. põlvkond)"
 */
export function cpuGenerationLabel(key: string): string {
  const [vendor, value] = key.split("-");
  if (vendor === "intel") return `Intel ${value}. põlvkond`;
  if (vendor === "core") return `Intel Core (seeria ${value})`;
  if (vendor === "ultra") return `Core Ultra (seeria ${value})`;
  if (vendor === "amd") return `Ryzen ${value}-seeria`;
  if (vendor === "amdai") return `Ryzen AI ${value}-seeria`;
  if (vendor === "apple") return `Apple M${value}`;
  if (vendor === "snapdragon") return `Snapdragon X (${value}. põlvkond)`;
  return key;
}

/**
 * Filtri järjekord: tootja kaupa rühmad (Intel Core Ultra → Intel Core seeria → Intel Core i → AMD Ryzen AI → AMD Ryzen →
 * Apple → Snapdragon), rühma sees uuem eespool (numbriliselt, mitte tähestikuliselt: 14, 13, 12 … 8). Eri tootjate
 * põlvkondi ei panda ühisele skaalale.
 */
const GENERATION_GROUPS = ["ultra", "core", "intel", "amdai", "amd", "apple", "snapdragon"];

export function compareCpuGenerations(a: string, b: string): number {
  const [va, xa] = a.split("-");
  const [vb, xb] = b.split("-");
  const ga = GENERATION_GROUPS.indexOf(va);
  const gb = GENERATION_GROUPS.indexOf(vb);
  return (ga === -1 ? 99 : ga) - (gb === -1 ? 99 : gb) || Number(xb) - Number(xa) || a.localeCompare(b);
}

/**
 * Toodete sorteerimiseks ("Uuemad mudelid", "Soovitatud") on vaja ühte ligikaudset "uudsuse" skaalat
 * üle tootjate. Ainult järjestamiseks — filtris kasutatakse compareCpuGenerations'i. Sama skaala on SQL-is
 * (catalog-queries.ts → gen_rank).
 */
export function cpuGenerationRank(key: string | null): number {
  if (!key) return 0;
  const [vendor, raw] = key.split("-");
  const value = Number(raw);
  if (vendor === "intel") return value;
  if (vendor === "core") return 12 + value; // Core 7 150U (2024, Raptor Lake) ≈ Intel 13. põlvkond
  if (vendor === "ultra") return 13 + value;
  if (vendor === "amd") return 6 + value / 1000; // Ryzen 5000 ≈ Intel 11. põlvkonna ajastu
  if (vendor === "amdai") return 15; // Ryzen AI 300 (2024) ≈ Core Ultra 2
  if (vendor === "apple") return 10 + value; // M1 (2020) ≈ Intel 11. põlvkond
  if (vendor === "snapdragon") return 15; // Snapdragon X (2024) ≈ Core Ultra 2
  return 0;
}

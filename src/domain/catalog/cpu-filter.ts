/**
 * Protsessori filtri väärtused (perekond ja põlvkond).
 *
 * Eelistatakse andmebaasi väärtust (tarnija sync / admini parandus: `cpu.family`, `cpu.generationKey`).
 * Kui see puudub (nt Apple M2, Core Ultra 9, Ryzen AI — vanem parser neid ei tundnud), tuletatakse
 * väärtus protsessori nimest. Ainult filtri ja kuvamise jaoks — sync'i ega andmebaasi ei muudeta.
 *
 * Perekonna võtmed:   intel-core-i5 · intel-core-ultra-7 · amd-ryzen-5 · amd-ryzen-ai-7 · apple-m2 · apple-m2-pro
 * Põlvkonna võtmed:   ultra-2 · intel-13 · amdai-300 · amd-7000 · apple-2
 */

export interface CpuInfo {
  model: string;
  family: string | null;
  generationKey: string | null;
}

const APPLE = /\bApple\s+M(\d{1,2})(?:\s+(Pro|Max|Ultra))?\b/i;
const INTEL_ULTRA = /\bCore\s*Ultra\s*([579])\s*(\d)\d{2}[a-z]*/i;
const INTEL_CORE = /\bi([3579])[-\s]?(\d{4,5})[a-z0-9]*/i;
// "AMD Ryzen AI 7 PRO 360" ja tarnija lühem kirjapilt "AMD AI 7 PRO 360"
const AMD_AI = /\bAMD\s+(?:Ryzen\s+)?AI\s*([579])\s*(?:PRO\s*)?(\d)\d{2}\b/i;
const AMD_RYZEN = /\bRyzen\s*([3579])\s*(?:PRO\s*)?(\d)\d{3}[a-z]*/i;

// ---- Perekond ----------------------------------------------------------------

export function cpuFilterFamily(cpu: CpuInfo): string | null {
  if (cpu.family) return cpu.family;
  const text = cpu.model.replace(/\s+/g, " ");
  const apple = text.match(APPLE);
  if (apple) return `apple-m${apple[1]}${apple[2] ? `-${apple[2].toLowerCase()}` : ""}`;
  const ultra = text.match(INTEL_ULTRA);
  if (ultra) return `intel-core-ultra-${ultra[1]}`;
  const core = text.match(INTEL_CORE);
  if (core) return `intel-core-i${core[1]}`;
  const ai = text.match(AMD_AI);
  if (ai) return `amd-ryzen-ai-${ai[1]}`;
  const ryzen = text.match(AMD_RYZEN);
  if (ryzen) return `amd-ryzen-${ryzen[1]}`;
  return null;
}

const FAMILY_PATTERN = /^(intel-core-i[3579]|intel-core-ultra-[579]|amd-ryzen-[3579]|amd-ryzen-ai-[579]|apple-m\d{1,2}(-(pro|max|ultra))?)$/;

export function isCpuFamilyValue(value: string): boolean {
  return FAMILY_PATTERN.test(value);
}

export function cpuFamilyLabel(value: string): string {
  let m = value.match(/^intel-core-i(\d)$/);
  if (m) return `Intel Core i${m[1]}`;
  m = value.match(/^intel-core-ultra-(\d)$/);
  if (m) return `Intel Core Ultra ${m[1]}`;
  m = value.match(/^amd-ryzen-ai-(\d)$/);
  if (m) return `AMD Ryzen AI ${m[1]}`;
  m = value.match(/^amd-ryzen-(\d)$/);
  if (m) return `AMD Ryzen ${m[1]}`;
  m = value.match(/^apple-m(\d+)(?:-(pro|max|ultra))?$/);
  if (m) return `Apple M${m[1]}${m[2] ? ` ${m[2][0].toUpperCase()}${m[2].slice(1)}` : ""}`;
  return value;
}

const FAMILY_GROUPS = ["intel-core-i", "intel-core-ultra-", "amd-ryzen-", "amd-ryzen-ai-", "apple-m"];
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
  return [FAMILY_GROUPS.length, 0, 0];
}

/** Tootja kaupa rühmitatud (Intel Core, Core Ultra, Ryzen, Ryzen AI, Apple), rühmas tase kasvavalt (i3 → i9, M1 → M4) */
export function compareCpuFamilies(a: string, b: string): number {
  const [ga, na, ta] = familySortKey(a);
  const [gb, nb, tb] = familySortKey(b);
  return ga - gb || na - nb || ta - tb || a.localeCompare(b);
}

// ---- Põlvkond ----------------------------------------------------------------

export function cpuFilterGeneration(cpu: CpuInfo): string | null {
  if (cpu.generationKey) return cpu.generationKey;
  const text = cpu.model.replace(/\s+/g, " ");
  const apple = text.match(APPLE);
  if (apple) return `apple-${apple[1]}`;
  const ultra = text.match(INTEL_ULTRA);
  if (ultra) return `ultra-${ultra[2]}`;
  const core = text.match(INTEL_CORE);
  if (core) {
    const digits = core[2];
    return `intel-${digits.startsWith("1") ? Number(digits.slice(0, 2)) : Number(digits[0])}`;
  }
  const ai = text.match(AMD_AI);
  if (ai) return `amdai-${ai[2]}00`;
  const ryzen = text.match(AMD_RYZEN);
  if (ryzen) return `amd-${ryzen[2]}000`;
  return null;
}

export function isCpuGenerationValue(value: string): boolean {
  return /^(intel|ultra|amd|amdai|apple)-\d{1,4}$/.test(value);
}

/** "intel-12" → "Intel 12. põlvkond", "ultra-1" → "Core Ultra (seeria 1)", "amd-5000" → "Ryzen 5000-seeria", "amdai-300" → "Ryzen AI 300-seeria", "apple-2" → "Apple M2" */
export function cpuGenerationLabel(key: string): string {
  const [vendor, value] = key.split("-");
  if (vendor === "intel") return `Intel ${value}. põlvkond`;
  if (vendor === "ultra") return `Core Ultra (seeria ${value})`;
  if (vendor === "amd") return `Ryzen ${value}-seeria`;
  if (vendor === "amdai") return `Ryzen AI ${value}-seeria`;
  if (vendor === "apple") return `Apple M${value}`;
  return key;
}

/**
 * Filtri järjekord: tootja kaupa rühmad (Intel Core Ultra → Intel Core → AMD Ryzen AI → AMD Ryzen → Apple),
 * rühma sees uuem eespool (numbriliselt, mitte tähestikuliselt: 14, 13, 12 … 8). Eri tootjate põlvkondi
 * ei panda ühisele skaalale.
 */
const GENERATION_GROUPS = ["ultra", "intel", "amdai", "amd", "apple"];

export function compareCpuGenerations(a: string, b: string): number {
  const [va, xa] = a.split("-");
  const [vb, xb] = b.split("-");
  const ga = GENERATION_GROUPS.indexOf(va);
  const gb = GENERATION_GROUPS.indexOf(vb);
  return (ga === -1 ? 99 : ga) - (gb === -1 ? 99 : gb) || Number(xb) - Number(xa) || a.localeCompare(b);
}

/**
 * Toodete sorteerimiseks ("Uuemad mudelid", "Soovitatud") on vaja ühte ligikaudset "uudsuse" skaalat
 * üle tootjate. Ainult järjestamiseks — filtris kasutatakse compareCpuGenerations'i.
 */
export function cpuGenerationRank(key: string | null): number {
  if (!key) return 0;
  const [vendor, raw] = key.split("-");
  const value = Number(raw);
  if (vendor === "intel") return value;
  if (vendor === "ultra") return 13 + value;
  if (vendor === "amd") return 6 + value / 1000; // Ryzen 5000 ≈ Intel 11. põlvkonna ajastu
  if (vendor === "amdai") return 15; // Ryzen AI 300 (2024) ≈ Core Ultra 2
  if (vendor === "apple") return 10 + value; // M1 (2020) ≈ Intel 11. põlvkond
  return 0;
}

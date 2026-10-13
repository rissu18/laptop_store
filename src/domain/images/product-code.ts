import { identityWords, titleScreenSize, type ModelIdentity, type ModelIdentityInput } from "./model-identity";

/**
 * Tarbijamudelite TOOTEKOOD Icecati vasteks (piltide jaoks).
 *
 * Icecat nimetab tarbijamudeleid SKU tasemel: "SF314-52-567W", "X1504ZA-NJ672", "NP950XED-KF2US",
 * "Bravo 15 C7VFK-263BE", "Laptop 14-em0505na". Meie tarnijate nimes on ainult platvormi kood ("Swift 3 SF314-52",
 * "VivoBook 15 X1504"), mistõttu tavaline nimevõrdlus loeb SKU järelliidet teiseks mudeliks.
 *
 * Reeglid on tootjapõhised ja RANGED (mitte üldine lõdvendus):
 *   - Acer, Samsung (SUFFIX):  Icecati sõna = kood või kood + "-järelliide"; täht koodi järel on teine mudel
 *                              (SF314-52 ≠ SF314-52G — eraldi graafikaga variant)
 *   - ASUS (LETTERS_SUFFIX):   kood + kuni 3 tähte (CPU/platvormi variant samas korpuses: X1504 → X1504ZA / X1504VA)
 *                              + valikuline "-järelliide"; ASUS-e kood määrab korpuse üheselt
 *   - MSI (LETTERS_SUFFIX):    nagu ASUS, AGA ka liini sõnad peavad klappima (C7V on mitmes liinis: "Bravo 15 C7V")
 *   - HP tarbijamudelid (HP_PLATFORM): "14-em0422no" → platvorm "14-em0" (Icecat "14-em0505na"); liini sõnad
 *                              (Pavilion / Omen / Envy / x360 / Victus / Spectre) peavad klappima
 *   - LG ja teised: ei toetata (LG "14Z90" on Icecatis mitme aasta mudel: 14Z90Q / 14Z90T / 14Z90U)
 * Pealkirja kontroll (titleHasProductCode) on kohustuslik: kood, korpus (x360/Flip/Chromebook …), ekraan.
 */

export type ProductCodeMode = "SUFFIX" | "LETTERS_SUFFIX" | "HP_PLATFORM";

export interface ProductCode {
  brand: string;
  /** Meie kood väiketähtedega ("sf314-52", "x1504", "c7v"; HP: platvorm "14-em0") */
  code: string;
  mode: ProductCodeMode;
  /** Sõnad, mis peavad Icecati nimes/pealkirjas olema (MSI liin, HP liin) */
  lineWords: string[];
  /** HP liini sõnad, mida meil pole — Icecatis ei tohi olla */
  forbiddenWords: string[];
}

const HP_LINES = ["pavilion", "omen", "envy", "x360", "victus", "spectre"];
/** Teist korpust tähistavad sõnad Icecati nimes/pealkirjas, kui meie nimes neid pole */
const FORM_WORDS = new Set(["x360", "360", "flip", "yoga", "2in1", "chromebook", "detachable", "convertible", "rugged", "spin", "fold", "duo"]);

const BRAND_CODE: Record<string, { pattern: RegExp; mode: ProductCodeMode }> = {
  acer: { pattern: /\b([a-z]{1,3}\d{2,3}[a-z]?-\d{2}[a-z]{0,2})\b/i, mode: "SUFFIX" },
  samsung: { pattern: /\b(np\d{3}[a-z]{3})\b/i, mode: "SUFFIX" },
  asus: { pattern: /\b([a-z]{1,2}\d{3,4}[a-z]{0,3})\b/i, mode: "LETTERS_SUFFIX" },
  msi: { pattern: /\b([a-z]\d{1,2}[a-z]{1,2}|\d{1,2}[a-z]{2,3})\b/i, mode: "LETTERS_SUFFIX" },
};

export function consumerProductCode(input: ModelIdentityInput): ProductCode | null {
  const brand = input.manufacturer.toLowerCase();
  const text = `${input.family} ${input.model}`;
  if (brand === "hp") {
    const match = text.match(/\b(\d{2}s?-[a-z]{2}\d)\d{3}[a-z]{2}\b/i);
    if (!match) return null;
    const words = identityWords(text);
    return { brand, code: match[1].toLowerCase(), mode: "HP_PLATFORM", lineWords: HP_LINES.filter((w) => words.includes(w)), forbiddenWords: HP_LINES.filter((w) => !words.includes(w)) };
  }
  const rule = BRAND_CODE[brand];
  const match = rule && input.model.match(rule.pattern);
  if (!match) return null;
  const code = match[1].toLowerCase();
  if (brand === "asus" && !/\d{3}/.test(code)) return null;
  // MSI: liini sõnad = mudelinime ülejäänud sõnad ("Bravo 15", "Modern 14", "GV62")
  const lineWords = brand === "msi" ? identityWords(input.model.replace(match[1], " ")).filter((w) => w !== "gaming") : [];
  if (brand === "msi" && !lineWords.length) return null;
  return { brand, code, mode: rule.mode, lineWords, forbiddenWords: [] };
}

/** Icecati sõnad koodi kontrolliks: tühikute järgi, väiketähtedega, kirjavahemärgid otstest maha (side-kriips jääb) */
function rawWords(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[\s,;/()"]+/)
    .map((w) => w.replace(/^[^a-z0-9]+|[^a-z0-9]+$/g, ""))
    .filter(Boolean);
}

function wordMatchesCode(pc: ProductCode, word: string): boolean {
  switch (pc.mode) {
    case "SUFFIX":
      return word === pc.code || word.startsWith(`${pc.code}-`);
    case "LETTERS_SUFFIX":
      return word.startsWith(pc.code) && /^[a-z]{0,3}(-[a-z0-9-]+)?$/.test(word.slice(pc.code.length));
    case "HP_PLATFORM":
      return word.startsWith(pc.code) && /^\d{2}s?-[a-z]{2}\d{4}[a-z]{2}$/.test(word);
  }
}

/** Konverteeritavad liinid on ise 2-in-1 — Icecati "Hybrid (2-in-1)" on neil lubatud */
const CONVERTIBLE = new Set(["x360", "360", "flip", "yoga", "spin"]);

function hasForeignForm(identity: Pick<ModelIdentity, "tokens">, text: string): boolean {
  const convertible = identity.tokens.some((t) => CONVERTIBLE.has(t));
  return identityWords(text).some((w) => FORM_WORDS.has(w) && !identity.tokens.includes(w) && !(convertible && (w === "2in1" || w === "convertible")));
}

/** Kas Icecati indeksi rida (Model_Name / Prod_ID) on sama tootekoodiga mudel */
export function codeMatchesIcecatName(pc: ProductCode, identity: Pick<ModelIdentity, "tokens">, modelName: string, prodId = ""): boolean {
  const words = rawWords(`${modelName} ${prodId}`);
  if (!words.some((w) => wordMatchesCode(pc, w))) return false;
  if (hasForeignForm(identity, modelName)) return false;
  const nameWords = identityWords(modelName);
  if (pc.forbiddenWords.some((w) => nameWords.includes(w))) return false;
  // MSI: liini sõnad peavad nimes olema (C7V on mitmes liinis); HP: nimes võib liin puududa → kontrollib pealkiri
  return pc.brand !== "msi" || pc.lineWords.every((w) => nameWords.includes(w));
}

/** Icecati toote pealkirja kontroll tootekoodi vastele: kood, liin, korpus, ekraani suurus */
export function titleHasProductCode(pc: ProductCode, identity: Pick<ModelIdentity, "tokens" | "screenSizeIn">, title: string): boolean {
  if (!rawWords(title).some((w) => wordMatchesCode(pc, w))) return false;
  if (hasForeignForm(identity, title)) return false;
  const words = identityWords(title);
  if (!pc.lineWords.every((w) => words.includes(w)) || pc.forbiddenWords.some((w) => words.includes(w))) return false;
  const size = titleScreenSize(title);
  return !(size !== null && identity.screenSizeIn && Math.abs(size - identity.screenSizeIn) > 0.75);
}

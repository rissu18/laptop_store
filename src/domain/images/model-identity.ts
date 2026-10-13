/**
 * Mudeli identiteet Icecati nimepõhiseks vasteks (PILTIDE jaoks).
 *
 * Tootepildi jaoks piisab: TOOTJA + ÕIGE MUDELI IDENTITEET ("HP EliteBook 840 G7", "Lenovo ThinkPad T14s Gen 3").
 * CPU, RAM, SSD, klaviatuur, OS ei pea klappima — need on konfiguratsiooni andmed, mida Icecatist kunagi ei võeta.
 *
 * Mudeli identiteet PEAB säilima:
 *   T14 ≠ T14s, Gen 2 ≠ Gen 3, 840 G7 ≠ 840 G8, 840 ≠ 845, x360 ≠ tavaline, Yoga ≠ tavaline,
 *   Rugged ≠ tavaline, P14 ≠ P14s, X13 ≠ X13 Yoga, Precision 5680 ≠ 5690, X1 Carbon Gen 9 ≠ Gen 10.
 *
 * Müra (ei muuda korpust): "Notebook PC", "Laptop", "Business", "(Intel)", "(AMD)", "Windows 11", ekraani tollid/cm,
 * Lenovo masinatüüp (21BR), HP ekraani suurus mudelinumbri järel ("EliteBook 860 16 G10").
 *
 * Otsused:
 *   EXACT          — identiteedi sõnad on täpselt samad
 *   FAMILY_MISSING — Icecati mudelinimes puudub ainult seeria (Dell: "5430" seeria Latitude/Precision asemel);
 *                    lubatud ainult koos pealkirja kontrolliga (titleHasIdentity)
 *   FIRST_GEN      — Lenovo "… Gen 1" ↔ Icecati nimi ilma põlvkonnata (1. põlvkond müüdi ilma "Gen 1"-ta: "ThinkPad E14");
 *                    lubatud ainult pealkirja kontrolli + TÄPSE CPU ajastu kokkulangevusega (cpuEraMatch)
 *   REVIEW         — tõenäoliselt sama, aga ebakindel (nt Icecatis puudub põlvkond, tundmatu lisasõna)
 *   REJECT         — erinev mudel (põlvkond, number, vormitegur, s-täht …)
 */

export type IdentityVerdict = "EXACT" | "FAMILY_MISSING" | "FIRST_GEN" | "REVIEW" | "REJECT";

export interface ModelIdentityInput {
  manufacturer: string;
  family: string;
  model: string;
  screenSizeIn?: number | null;
}

export interface ModelIdentity {
  manufacturer: string;
  /** Järjestatud identiteedisõnad (seeria + mudel), nt ["thinkpad", "t14s", "g3"] */
  tokens: string[];
  /** Seeria sõnad (võivad Icecati mudelinimest puududa — Dell) */
  familyTokens: string[];
  /** Ekraani suurus täisarvuna — sama arv Icecati nimes on müra (HP "860 16 G10") */
  sizeToken: string | null;
  /** Meie mudeli ekraan tollides (pealkirja diagonaali kontroll) */
  screenSizeIn: number | null;
  /** Selle tootja/seeria turundus- või materjalisõnad, mis korpust ei muuda (brandNoise) — eemaldatakse ka Icecati nimest/pealkirjast */
  noise: string[];
}

export interface IdentityComparison {
  verdict: IdentityVerdict;
  reason: string;
  /** Meie mudelinimes pole põlvkonda, Icecatis on sama nimi põlvkonnaga ("X13" vs "X13 Gen 2") → mitmetähenduslik */
  generationVariant?: boolean;
}

const BRAND_WORDS = new Set([
  "hp", "hewlett", "packard", "lenovo", "dell", "apple", "asus", "acer", "msi", "samsung", "fujitsu", "lg", "honor",
  "gigabyte", "microsoft", "huawei", "razer", "xiaomi", "panasonic",
]);

/** Sõnad, mis ei muuda korpust ega pilti */
const NOISE = new Set([
  "notebook", "laptop", "pc", "computer", "business", "mobile", "workstation", "ultrabook", "intel", "amd", "ryzen",
  "series", "edition", "the", "touch", "hybrid", "with", "and", "inch", "in", "dizustu", "bilgisayar", "portatil",
  "ordinateur", "portable", "computadora", "notebookpc", "black", "silver", "grey", "gray",
  // Icecati andmelehtede kohatäide ja Microsofti turundusmärk ("ZBook Power G7 … Configurable Material", "Copilot+ PC")
  "configurable", "material", "copilot",
]);

/**
 * Tootja/seeria TÄPSED turundus- ja materjalisõnad, mis korpust ei muuda (mitte üldine lõdvendus):
 *   - MSI: "MSI Gaming VECTOR GP76" = Vector GP76 ("Gaming" on MSI liini eesliide)
 *   - Dell Latitude: "Latitude 7430 Carbon" / "Magnesium" = Latitude 7430 (korpuse materjal, sama kuju)
 *   - ASUS: "Zenbook 14 OLED UX3402" = Zenbook 14 UX3402 — ainult siis, kui mudelinimes on tootekood (UX3402),
 *     mis korpuse üheselt määrab
 * Mujal jäävad need sõnad eristavaks (ThinkPad X1 Carbon, Galaxy Book OLED jne).
 */
function brandNoise(manufacturer: string, familyTokens: string[], tokens: string[]): string[] {
  const brand = manufacturer.toLowerCase();
  if (brand === "msi") return ["gaming"];
  if (brand === "dell" && familyTokens.includes("latitude")) return ["carbon", "magnesium"];
  if (brand === "asus" && tokens.some((t) => /^[a-z]{1,3}\d{3,4}[a-z]{0,3}$/.test(t) && /\d{3}/.test(t))) return ["oled"];
  return [];
}

/**
 * Vormitegurid ja alamliinid: kui Icecati nimes on see LISAKS meie mudelile, on see teine mudel.
 * ("EliteBook 840 G7" vs "EliteBook x360 840 G7", "X13" vs "X13 Yoga", "Latitude 5430" vs "Latitude 5430 Rugged")
 */
const DISCRIMINATORS = new Set([
  "x360", "360", "yoga", "flip", "2in1", "rugged", "extreme", "carbon", "titanium", "nano", "aero", "fold", "dragonfly",
  "studio", "fury", "power", "create", "firefly", "detachable", "convertible", "chromebook", "pro", "plus", "max", "ultra",
  "edge", "slim", "go", "duo", "flex", "tablet", "x2", "x1", "magnesium", "spin", "book", "air", "mini", "oled", "gaming",
  "creator", "stealth", "thin", "lite", "neo", "elite", "dual", "screen", "x13", "vision", "refurbished",
]);

/** Pealkirjas ükskõik kus → teine vormitegur/korpus, kui meie mudelinimes seda pole */
const TITLE_FORM_FACTORS = new Set(["chromebook", "rugged", "2in1", "x360", "yoga", "detachable", "convertible", "flip", "extreme", "titanium", "carbon", "refurbished"]);

/** Konverteeritavad liinid — need on ise 2-in-1 */
const CONVERTIBLES = new Set(["yoga", "x360", "360", "flip", "flex", "revolve", "spin", "2in1", "convertible"]);

const GENERATION = /^g\d{1,2}$/;
const ORDINAL_GEN = /\(?\b(\d{1,2})(?:st|nd|rd|th)\s+gen(?:eration)?\b\)?/g;
/** Lenovo masinatüüp (MTM-i 4 esimest märki): 20NE, 21BR — ei ole mudeliidentiteet */
const LENOVO_MACHINE_TYPE = /^(?:1\d|2\d)[a-z]{2}$|^(?:1\d|2\d)[a-z]\d$/;

function baseNormalize(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[®™©]/g, " ")
    .replace(/\bwindows\s*\d{1,2}\b/g, " ")
    .replace(/\b\d{1,2}(?:[.,]\d)?\s*(?:cm|mm)\b/g, " ") // 35.6 cm
    .replace(/\(\s*\d{1,2}(?:[.,]\d)?\s*(?:"|''|”|″|inch|in)\s*\)/g, " ") // (14")
    .replace(/\b\d{1,2}[.,]\d\s*(?:"|''|”|″|-inch|inch)/g, " ") // 15.6" (spetsifikatsioon)
    .replace(/\b(\d{2})\s*(?:"|''|”|″|-inch|inch)/g, " $1 ") // "16 inch" mudelinimes → 16 (Firefly 14 ≠ Firefly 16)
    .replace(/\b2\s*-?\s*in\s*-?\s*1\b/g, " 2in1 ")
    .replace(ORDINAL_GEN, " gen $1 ")
    .replace(/\bgen(?:eration)?\s*\.?\s*(\d{1,2})\b/g, " g$1 ") // "Gen 3" → g3 (HP "G3" on sama)
    .replace(/\b(\d{1,2})\s*gen\b/g, " g$1 ")
    .replace(/\bbook(\d{1,2})\b/g, " book $1 "); // Samsung "Galaxy Book4 Pro" = "Galaxy Book 4 Pro"
}

/** Teksti sõnad (müra ja tootja nimi eemaldatud), järjekord säilib */
export function identityWords(text: string): string[] {
  return baseNormalize(text)
    .replace(/[^a-z0-9]+/g, " ")
    .split(/\s+/)
    .filter((w) => w && !NOISE.has(w) && !BRAND_WORDS.has(w))
    // Icecati pealkirjades korduv sõna ("HP ZBook Power Power G8") — üks sõna
    .filter((w, i, all) => w !== all[i - 1]);
}

export function buildModelIdentity(input: ModelIdentityInput): ModelIdentity {
  const family = identityWords(input.family);
  const model = identityWords(input.model);
  // "ThinkPad P" + "P14s Gen 1": üksik seeriatäht kordub mudelinimes → välja
  const familyTokens = family.filter((t) => !(t.length === 1 && model.some((m) => m.startsWith(t))));
  const all = [...new Set([...familyTokens.filter((t) => !model.includes(t)), ...model])];
  const noise = brandNoise(input.manufacturer, familyTokens, all);
  const tokens = all.filter((t) => !noise.includes(t));
  const size = input.screenSizeIn ? String(Math.round(input.screenSizeIn)) : null;
  return { manufacturer: input.manufacturer.toLowerCase(), tokens, familyTokens, sizeToken: size, screenSizeIn: input.screenSizeIn ?? null, noise };
}

/** Icecati teksti sõnad selle mudeli müra sõnadeta (brandNoise) */
function icecatWords(identity: ModelIdentity, text: string): string[] {
  const words = identityWords(text);
  return identity.noise.length ? words.filter((w) => !identity.noise.includes(w)).filter((w, i, all) => w !== all[i - 1]) : words;
}

function isDistinctive(token: string): boolean {
  return /\d/.test(token) || DISCRIMINATORS.has(token);
}

/** Tokenid võrdluseks: ekraani suurus on müra ainult siis, kui mudelinimes on ka muu number */
function comparable(tokens: string[], sizeToken: string | null): string[] {
  const withoutMachineType = tokens.filter((t) => !LENOVO_MACHINE_TYPE.test(t));
  if (!sizeToken) return withoutMachineType;
  const others = withoutMachineType.filter((t) => t !== sizeToken);
  return others.some((t) => /\d/.test(t)) ? others : withoutMachineType;
}

/**
 * Võrdleb meie mudeli identiteeti Icecati mudelinimega (indeksi `Model_Name` või toote pealkiri ilma konfiguratsioonita).
 */
export function compareModelName(identity: ModelIdentity, icecatModelName: string): IdentityComparison {
  const ours = comparable(identity.tokens, identity.sizeToken);
  const theirs = comparable(icecatWords(identity, icecatModelName), identity.sizeToken);
  if (!theirs.length) return { verdict: "REJECT", reason: "Icecati mudelinimi on tühi" };
  const theirSet = new Set(theirs);
  const ourSet = new Set(ours);
  const missing = ours.filter((t) => !theirSet.has(t));
  const extra = theirs.filter((t) => !ourSet.has(t));

  const ourGen = ours.find((t) => GENERATION.test(t));
  const theirGen = theirs.find((t) => GENERATION.test(t));
  if (ourGen && theirGen && ourGen !== theirGen) return { verdict: "REJECT", reason: `põlvkond ${ourGen} ≠ ${theirGen}` };

  const extraDistinctive = extra.filter(isDistinctive);
  if (extraDistinctive.length) {
    const generationVariant = !ourGen && !missing.length && extraDistinctive.every((t) => GENERATION.test(t));
    return { verdict: "REJECT", reason: `Icecatis lisaks: ${extraDistinctive.join(" ")}`, generationVariant };
  }

  if (!missing.length) {
    return extra.length ? { verdict: "REVIEW", reason: `Icecatis tundmatu lisasõna: ${extra.join(" ")}` } : { verdict: "EXACT", reason: "mudelinimi klapib" };
  }
  // Meie mudeli osa puudub Icecatis
  if (missing.every((t) => identity.familyTokens.includes(t)) && ours.some((t) => /\d/.test(t) && theirSet.has(t))) {
    return extra.length ? { verdict: "REVIEW", reason: `seeria puudub, lisasõna: ${extra.join(" ")}` } : { verdict: "FAMILY_MISSING", reason: `seeria puudub nimest (${missing.join(" ")})` };
  }
  if (missing.length === 1 && missing[0] === "g1" && !extra.length && !theirGen && identity.manufacturer === "lenovo") {
    return { verdict: "FIRST_GEN", reason: "Icecati nimes pole põlvkonda (Lenovo 1. põlvkond müüdi ilma Gen 1-ta)" };
  }
  if (missing.length === 1 && GENERATION.test(missing[0]) && !extra.length) {
    return { verdict: "REVIEW", reason: `Icecati nimes puudub põlvkond (${missing[0]})` };
  }
  return { verdict: "REJECT", reason: `puudub: ${missing.join(" ")}` };
}

/**
 * Kas Icecati toote pealkiri sisaldab meie mudeli identiteeti JÄRJESTIKUSTE sõnadena ja selle kõrval pole
 * teist mudelit tähistavat sõna. Pealkirjas on ka konfiguratsioon (CPU, RAM …) — see on lubatud.
 *   "Lenovo ThinkPad T14s Gen 3 Intel Core i5-1245U Laptop 35.6 cm (14") …" ✓ T14s Gen 3
 *   "HP EliteBook x360 1040 G9 …" ✗ EliteBook 1040 G9   ·   "Dell Latitude 5430 Rugged …" ✗ Latitude 5430
 */
export function titleHasIdentity(identity: ModelIdentity, title: string, options: { firstGenUnnamed?: boolean } = {}): boolean {
  const words = icecatWords(identity, title);
  // FIRST_GEN: pealkirjas ei tohi olla ühtegi põlvkonda; meie "g1" jääb järjestusest välja
  if (options.firstGenUnnamed && words.some((w) => GENERATION.test(w))) return false;
  const ours = new Set(identity.tokens);
  const convertible = identity.tokens.some((t) => CONVERTIBLES.has(t));
  // Teist korpust tähistav sõna ükskõik kus pealkirjas ("Latitude 5430 … Chromebook", "… Rugged") → mitte meie mudel.
  // Yoga / x360 / Flex / Revolve on ise 2-in-1 — Icecati "Hybrid (2-in-1)" on neil lubatud.
  const foreign = (w: string) => TITLE_FORM_FACTORS.has(w) && !ours.has(w) && !(convertible && (w === "2in1" || w === "convertible"));
  if (words.some(foreign)) return false;

  // Ekraani diagonaal pealkirjas ("35.6 cm (14")") peab klappima meie mudeliga (Firefly 14 G11 ≠ Firefly G11 16")
  const titleSize = titleScreenSize(title);
  if (titleSize !== null && identity.screenSizeIn && Math.abs(titleSize - identity.screenSizeIn) > 0.75) return false;

  // "2-in-1" ja ekraani suurus võivad pealkirjas olla mujal ("ThinkPad L13 2-in-1 Gen 5", "Vostro 5401 … (14")")
  const sizeIsNoise = identity.sizeToken !== null && identity.tokens.some((t) => t !== identity.sizeToken && /\d/.test(t));
  const floating = new Set<string>(["2in1", ...(sizeIsNoise ? [identity.sizeToken!] : [])]);
  if (ours.has("2in1") && !words.includes("2in1")) return false;
  if (sizeIsNoise && ours.has(identity.sizeToken!) && !words.includes(identity.sizeToken!) && titleSize === null) return false;
  const seq = identity.tokens.filter((t) => !LENOVO_MACHINE_TYPE.test(t) && !floating.has(t) && !(options.firstGenUnnamed && t === "g1"));
  if (!seq.length) return false;
  // Sõnajärg: meie OMA korpusesõna (Rugged, Yoga, x360 …) võib Icecatis olla mudelinumbri järel
  // ("Latitude 14 Rugged 5420" ↔ "Latitude 5420 Rugged"). Teisi sõnu ümber ei tõsteta.
  const qualifiers = seq.slice(1).filter((t) => DISCRIMINATORS.has(t) && !/\d/.test(t));
  const sequences = qualifiers.length ? [seq, [...seq.filter((t) => !qualifiers.includes(t)), ...qualifiers]] : [seq];
  return sequences.some((candidate) => titleHasSequence(identity, words, candidate, ours, floating));
}

function titleHasSequence(identity: ModelIdentity, words: string[], seq: string[], ours: Set<string>, floating: Set<string>): boolean {
  for (let start = 0; start < words.length; start++) {
    let i = start;
    let matched = 0;
    while (i < words.length && matched < seq.length) {
      if (words[i] === seq[matched]) {
        matched++;
        i++;
      } else if (matched > 0 && (floating.has(words[i]) || words[i] === identity.sizeToken)) i++; // HP "860 16 G10", "L13 2-in-1 Gen 5"
      else break;
    }
    if (matched !== seq.length) continue;
    const before = words[start - 1];
    let afterIndex = i;
    while (afterIndex < words.length && (floating.has(words[afterIndex]) || words[afterIndex] === identity.sizeToken)) afterIndex++;
    const after = words[afterIndex];
    const blocks = (w: string | undefined) => w !== undefined && !ours.has(w) && (DISCRIMINATORS.has(w) || GENERATION.test(w) || /^\d{2,4}[a-z]?$/.test(w));
    if (blocks(before) || blocks(after)) continue;
    return true;
  }
  return false;
}

/** Ekraani diagonaal Icecati pealkirjast tollides ("39.6 cm (15.6")" → 15.6); puudub → null */
export function titleScreenSize(title: string): number | null {
  const inch = title.match(/\(\s*(\d{1,2}(?:[.,]\d)?)\s*(?:"|''|”|″)\s*\)/) ?? title.match(/\b(\d{2}(?:[.,]\d)?)\s*(?:"|”|″)/);
  if (inch) return Number(inch[1].replace(",", "."));
  const cm = title.match(/\b(\d{2}(?:[.,]\d)?)\s*cm\b/);
  return cm ? Math.round((Number(cm[1].replace(",", ".")) / 2.54) * 10) / 10 : null;
}

/**
 * Protsessorite ajastu ("i7-4712HQ" → intel 4, "i5-1135G7" → intel 11, "Core Ultra 7 155U" → intel 14, "Ryzen 5 5625U"
 * → ryzen 5). Sama mudelinimi võib olla kahest ajastust (Dell XPS 15 9530: 2014 ja 2023; Latitude E5540 kirjas "5540").
 */
export function cpuEras(text: string): { intel: number[]; ryzen: number[] } {
  const lower = text.toLowerCase();
  // 4 numbrit: "8350" → 8, aga "1135" / "1245" → 11 / 12 (10.–13. põlvkonna U/G-mudelid); 5 numbrit: "10210" → 10
  const intel = [...lower.matchAll(/\bi[3579]-(\d{4,5})[a-z]{0,2}\d?\b/g)].map((m) => Number(m[1].length === 5 || m[1][0] === "1" ? m[1].slice(0, 2) : m[1][0]));
  if (/\bcore\s*(?:™\s*)?ultra\b/.test(lower)) intel.push(14);
  const ryzen = [...lower.matchAll(/\bryzen(?:™)?\s*(?:ai\s*)?\d\s*(?:pro\s*)?(\d)\d{3}[a-z]{0,2}\b/g)].map((m) => Number(m[1]));
  return { intel: [...new Set(intel)], ryzen: [...new Set(ryzen)] };
}

/**
 * Kas Icecati toote protsessor on TÄPSELT sama ajastu mis vähemalt ühel meie pakkumisel (sama Intel põlvkond või sama
 * Ryzen seeria). Kasutatakse ainult lisatõendina (FIRST_GEN), mitte ainsa võtmena; CPU puudumine → false.
 */
export function cpuEraMatch(icecatTitle: string, ourCpus: string[]): boolean {
  const theirs = cpuEras(icecatTitle);
  const ours = cpuEras(ourCpus.join(" "));
  return theirs.intel.some((x) => ours.intel.includes(x)) || theirs.ryzen.some((x) => ours.ryzen.includes(x));
}

/** Kas Icecati toote protsessor on meie pakkumiste omadest selgelt teisest ajastust (≥ 3 põlvkonda) */
export function cpuEraConflict(icecatTitle: string, ourCpus: string[]): boolean {
  const theirs = cpuEras(icecatTitle);
  const ours = cpuEras(ourCpus.join(" "));
  const far = (a: number[], b: number[]) => a.length > 0 && b.length > 0 && a.every((x) => b.every((y) => Math.abs(x - y) >= 3));
  return far(theirs.intel, ours.intel) || far(theirs.ryzen, ours.ryzen);
}

/** Apple: Icecati mudelinimi on ainult "MacBook Air" (suurus/aasta/kiip puudub) → automaatset nimevastet ei tehta */
export function requiresStrictIdentifier(manufacturer: string): boolean {
  return manufacturer.toLowerCase() === "apple";
}

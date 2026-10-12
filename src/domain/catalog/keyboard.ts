/**
 * Klaviatuuri paigutused — ÜKS register kogu poe jaoks (kõik tarnijad: Laptopid.ee, Tech, Foxway …).
 *
 *   tarnija toorväärtus ("SWE/FIN", "DEU", "Scandinavian") → kanooniline kood ("SWE", "DE", "SCA") → kliendi silt
 *
 * - Andmebaasi `supplier_listings.keyboard` hoiab kanoonilist koodi; tarnija algne kuju säilib (`details.keyboardRaw`,
 *   `raw_data`).
 * - Tundmatu kood jääb tarnija kujule (puhastatud, suurtähtedes) ja seda kuvatakse toorkujul — valesti ei tõlgita.
 * - Väärtust ei leiutata: puuduv klaviatuur = NULL. "Missing Keyboard" EI OLE paigutus (vt `missing`).
 * - Filtri valikud tulevad andmebaasist (ainult tegelikult olemasolevad väärtused) — siin on ainult sildid ja järjekord.
 *
 * Olemasolevad koodid (SWE, NOR, EST, US, UK, DE) jäävad samaks, et varasemad andmed ja admini parandused töötaksid.
 * Füüsiliselt erinevaid klaviatuure ei liideta (SCA ≠ SWE ≠ NOR; ENG ei ole "US" ega "UK", sest tarnija seda ei ütle).
 */

export interface KeyboardLayoutInfo {
  /** Kanooniline kood (andmebaasis, URL-is väiketähtedega) */
  code: string;
  /** Kliendi silt eesti keeles koos tarnija koodiga */
  label: string;
  /** Lühike selgitus tootelehel */
  explanation: string;
  /** Tarnijate kirjapildid (suurtähtedes) */
  aliases: string[];
}

/** Järjekord = filtri järjekord (Eesti kliendile olulisemad eespool); tundmatud koodid lõpus tähestikuliselt. */
export const KEYBOARD_REGISTRY: readonly KeyboardLayoutInfo[] = [
  { code: "EST", label: "Eesti (EST)", explanation: "Eesti paigutus", aliases: ["EE", "EST", "ESTONIAN"] },
  // Soome ja Rootsi paigutus on identsed (Foxway "SWE/FIN")
  { code: "SWE", label: "Rootsi (SWE)", explanation: "Rootsi/Soome paigutus", aliases: ["SE", "SWE", "FI", "FIN", "SWE/FIN", "SWEDISH", "FINNISH"] },
  // Rootsi paigutus, klahvidel ka kirillitsa (Laptopid.ee "SWE/RUS") — füüsiliselt erinev klaviatuur, eraldi kood
  { code: "SWE/RUS", label: "Rootsi + vene (SWE/RUS)", explanation: "Rootsi paigutus, klahvidel ka vene tähed", aliases: ["SWE/RUS", "SWE-RUS", "SE/RU"] },
  { code: "SCA", label: "Skandinaavia (SCA)", explanation: "Põhjamaade kombineeritud paigutus (Rootsi/Soome/Norra/Taani tähed)", aliases: ["SCA", "SCANDINAVIAN", "SCAN", "NORDIC"] },
  { code: "NOR", label: "Norra (NOR)", explanation: "Norra paigutus", aliases: ["NO", "NOR", "NORWEGIAN"] },
  { code: "DNK", label: "Taani (DNK)", explanation: "Taani paigutus", aliases: ["DK", "DNK", "DAN", "DANISH"] },
  { code: "ISL", label: "Islandi (ISL)", explanation: "Islandi paigutus", aliases: ["IS", "ISL", "ICELANDIC"] },
  { code: "US", label: "USA", explanation: "USA paigutus", aliases: ["US", "USA", "ENG-US", "US-INT"] },
  { code: "UK", label: "Inglise (UK)", explanation: "Inglise (UK) paigutus", aliases: ["UK", "GB", "GBR", "ENG-UK"] },
  { code: "INT", label: "Rahvusvaheline (INT)", explanation: "Rahvusvaheline (inglise) paigutus", aliases: ["INT", "INTL", "INTERNATIONAL"] },
  // Laptopid.ee "ENG": ingliskeelne, aga tarnija ei täpsusta US/UK — ei arvata, kumb
  { code: "ENG", label: "Inglise (ENG)", explanation: "Ingliskeelne paigutus (tarnija ei täpsusta, kas US või UK)", aliases: ["ENG", "EN", "ENGLISH"] },
  { code: "DE", label: "Saksa (DE)", explanation: "Saksa paigutus (QWERTZ)", aliases: ["DE", "DEU", "GER", "GERMAN"] },
  { code: "CHE", label: "Šveitsi (CHE)", explanation: "Šveitsi paigutus (QWERTZ)", aliases: ["CH", "CHE", "SWISS"] },
  { code: "AUT", label: "Austria (AUT)", explanation: "Austria paigutus (QWERTZ)", aliases: ["AT", "AUT"] },
  { code: "FRA", label: "Prantsuse (FRA)", explanation: "Prantsuse paigutus (AZERTY)", aliases: ["FR", "FRA", "FRENCH"] },
  { code: "BEL", label: "Belgia (BEL)", explanation: "Belgia paigutus (AZERTY)", aliases: ["BE", "BEL", "BELGIAN"] },
  { code: "NLD", label: "Hollandi (NLD)", explanation: "Hollandi paigutus", aliases: ["NL", "NLD", "DUTCH"] },
  { code: "ITA", label: "Itaalia (ITA)", explanation: "Itaalia paigutus", aliases: ["IT", "ITA", "ITALIAN"] },
  { code: "ESP", label: "Hispaania (ESP)", explanation: "Hispaania paigutus", aliases: ["ES", "ESP", "SPA", "SPANISH"] },
  { code: "PRT", label: "Portugali (PRT)", explanation: "Portugali paigutus", aliases: ["PT", "PRT", "POR", "PORTUGUESE"] },
  { code: "POL", label: "Poola (POL)", explanation: "Poola paigutus", aliases: ["PL", "POL", "POLISH"] },
  { code: "CZE", label: "Tšehhi (CZE)", explanation: "Tšehhi paigutus", aliases: ["CZ", "CZE", "CZECH"] },
  { code: "SVK", label: "Slovaki (SVK)", explanation: "Slovaki paigutus", aliases: ["SK", "SVK", "SLOVAK"] },
  { code: "HUN", label: "Ungari (HUN)", explanation: "Ungari paigutus", aliases: ["HU", "HUN", "HUNGARIAN"] },
  { code: "HRV", label: "Horvaatia (HRV)", explanation: "Horvaatia paigutus", aliases: ["HR", "HRV", "CROATIAN"] },
  { code: "SVN", label: "Sloveenia (SVN)", explanation: "Sloveenia paigutus", aliases: ["SI", "SVN", "SLOVENIAN"] },
  { code: "LTU", label: "Leedu (LTU)", explanation: "Leedu paigutus", aliases: ["LT", "LTU", "LITHUANIAN"] },
  { code: "LVA", label: "Läti (LVA)", explanation: "Läti paigutus", aliases: ["LV", "LVA", "LATVIAN"] },
  { code: "RUS", label: "Vene (RUS)", explanation: "Vene paigutus (kirillitsa)", aliases: ["RU", "RUS", "RUSSIAN"] },
  { code: "UKR", label: "Ukraina (UKR)", explanation: "Ukraina paigutus (kirillitsa)", aliases: ["UA", "UKR", "UKRAINIAN"] },
  { code: "GRC", label: "Kreeka (GRC)", explanation: "Kreeka paigutus", aliases: ["GR", "GRC", "GREEK"] },
  { code: "TUR", label: "Türgi (TUR)", explanation: "Türgi paigutus", aliases: ["TR", "TUR", "TURKISH"] },
  { code: "ARA", label: "Araabia (ARA)", explanation: "Araabia paigutus", aliases: ["AR", "ARA", "ARABIC"] },
  { code: "HEB", label: "Heebrea (HEB)", explanation: "Heebrea paigutus", aliases: ["HE", "HEB", "ISR", "HEBREW"] },
  { code: "JPN", label: "Jaapani (JPN)", explanation: "Jaapani paigutus", aliases: ["JP", "JPN", "JAPANESE"] },
  { code: "KOR", label: "Korea (KOR)", explanation: "Korea paigutus", aliases: ["KR", "KOR", "KOREAN"] },
];

/** Kanoonilised koodid (admini valik, valideerimine) */
export const KEYBOARD_CODES: readonly string[] = KEYBOARD_REGISTRY.map((k) => k.code);

const BY_CODE = new Map(KEYBOARD_REGISTRY.map((k) => [k.code, k]));
const BY_ALIAS = new Map(KEYBOARD_REGISTRY.flatMap((k) => k.aliases.map((alias) => [alias, k.code] as const)));

/** Tarnija väärtus, mis tähendab, et klaviatuur PUUDUB (füüsiline puudus, mitte paigutus) */
const MISSING_PATTERN = /^(missing|no|without)\s*keyboard$|^keyboard\s*missing$/i;
/** Tundmatu koodi lubatud kuju (filtri ja kuvamise jaoks); pikem/vabam tekst → ei salvestata koodina */
const RAW_CODE_PATTERN = /^[A-Z0-9][A-Z0-9/ -]{1,19}$/;

export interface KeyboardNormalization {
  /** Kanooniline kood või tundmatu koodi puhastatud kuju; null = puudub / ei saa kasutada */
  code: string | null;
  /** Kas kood on registris (tundmatut kuvatakse toorkujul) */
  known: boolean;
  /** Tarnija teatas, et klaviatuur puudub ("Missing Keyboard") — see on puudus, mitte paigutus */
  missing: boolean;
  /** Tarnija algne väärtus (trim) */
  raw: string | null;
}

/** Tarnija toorväärtus → kanooniline kood. Tühi/puuduv → null (ei leiutata). */
export function normalizeKeyboard(raw: string | null | undefined): KeyboardNormalization {
  const text = raw?.replace(/\s+/g, " ").trim() ?? "";
  if (!text) return { code: null, known: false, missing: false, raw: null };
  if (MISSING_PATTERN.test(text)) return { code: null, known: false, missing: true, raw: text };
  const upper = text.toUpperCase();
  const known = BY_ALIAS.get(upper);
  if (known) return { code: known, known: true, missing: false, raw: text };
  return RAW_CODE_PATTERN.test(upper) ? { code: upper, known: false, missing: false, raw: text } : { code: null, known: false, missing: false, raw: text };
}

/** Kanooniline kood (või varasem alias, nt admini parandus) → kliendi silt. Tundmatu → toorkood. */
export function keyboardLabel(code: string): string {
  const canonical = BY_CODE.get(code) ?? BY_CODE.get(BY_ALIAS.get(code.toUpperCase()) ?? "");
  return canonical?.label ?? code;
}

export function keyboardExplanation(code: string): string | null {
  return BY_CODE.get(code)?.explanation ?? null;
}

/**
 * Filtri (URL) väärtus: väiketähed, muu kui täht/number → "-" ("SWE" → "swe", tundmatu "SWE/FIN X" → "swe-fin-x").
 * Sama reegel on SQL-is (catalog-queries.ts → kb_v).
 */
export function keyboardFilterValue(code: string): string {
  return code
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

export const KEYBOARD_FILTER_PATTERN = /^[a-z0-9][a-z0-9-]{1,19}$/;

/** Filtri väärtus → silt (registris olev kood või toorkood suurtähtedes) */
export function keyboardFilterLabel(value: string): string {
  const known = KEYBOARD_REGISTRY.find((k) => keyboardFilterValue(k.code) === value);
  return known?.label ?? value.toUpperCase();
}

/** Filtri järjekord: registri järjekord, tundmatud lõpus tähestikuliselt */
export function compareKeyboardFilterValues(a: string, b: string): number {
  const rank = (value: string) => {
    const index = KEYBOARD_REGISTRY.findIndex((k) => keyboardFilterValue(k.code) === value);
    return index === -1 ? KEYBOARD_REGISTRY.length : index;
  };
  return rank(a) - rank(b) || a.localeCompare(b);
}

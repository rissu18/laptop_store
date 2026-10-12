/**
 * Foxway ProductName → tootja + mudelinimi (ProductModeli vasteks) + ekraan + puutetundlikkus.
 *
 *   "Dell Latitude 5330 Touch 13.3""                → Dell · "Latitude 5330"            · 13.3 · touch
 *   "Dell Latitude 3440 (2023) 14""                 → Dell · "Latitude 3440"            · 14
 *   "Lenovo ThinkPad E14 Gen 2 (AMD) 14""           → Lenovo · "ThinkPad E14 Gen 2"     · 14
 *   "Lenovo Thinkpad X1 Carbon (10th Gen) 14""      → Lenovo · "ThinkPad X1 Carbon Gen 10"
 *   "Asus Vivobook 15 (X1502) 15.6""                → ASUS · "VivoBook 15 X1502"        (mudelikood jääb)
 *   "Apple Macbook Air (13" 2020, M1)"              → Apple · "MacBook Air 13" 2020 M1" · 13 (+ Apple'i võtmed)
 *
 * SKU ei sõltu nimest (identiteet = SKU). Algne nimi säilib metaandmetes. Nimest eemaldatakse ainult kirjeldavad
 * lisad (protsessori tootja, aasta, "12th Gen Intel"), mitte mudelikoodid — eri mudeleid kokku ei liideta.
 */

export interface AppleNameKeys {
  /** "MacBook" | "MacBook Air" | "MacBook Pro" */
  series: string;
  screenIn: number | null;
  year: number | null;
  /** "Early" | "Mid" | "Late" */
  season: string | null;
  /** "M1", "M2 Pro", "M1 Max" … (null = Intel) */
  chip: string | null;
  /** "4 TBT3" (Thunderbolt 3 portide arv eristab 13" Intel MacBook Pro mudeleid) */
  ports: string | null;
}

export interface ParsedProductName {
  brand: string;
  /** Mudelinimi ilma tootjata (resolveModelRef sisend) */
  modelName: string;
  screenSizeIn: number | null;
  touch: boolean;
  apple: AppleNameKeys | null;
  /** 5G mainitud nimes (nt "Galaxy Book 3 Pro 360 5G") */
  fiveG: boolean;
}

/** Tootjad, mille nimi on mitmesõnaline (esimene sõna ei ole tootja) */
const MULTI_WORD_BRANDS = ["PC Specialist"];

/** Seeria kirjapilt (Foxway kirjutab vahel "Thinkpad", "Ideapad", "Macbook") */
const SERIES_CASING: Record<string, string> = {
  thinkpad: "ThinkPad",
  thinkbook: "ThinkBook",
  ideapad: "IdeaPad",
  elitebook: "EliteBook",
  probook: "ProBook",
  zbook: "ZBook",
  vivobook: "VivoBook",
  zenbook: "ZenBook",
  expertbook: "ExpertBook",
  matebook: "MateBook",
  magicbook: "MagicBook",
  macbook: "MacBook",
};

/** Sulgudes kirjeldav lisa, mis EI OLE mudeli osa (protsessori tootja, aasta, põlvkonna kirjeldus) → eemaldatakse */
const DESCRIPTOR = /^(intel|amd|qualcomm|quallcomm|snapdragon|(19|20)\d{2}|\d{1,2}(st|nd|rd|th)\s+gen(\s+(intel|amd))?|(ryzen|core)\s+\d{4}\s+series|amd\s+ryzen|intel\s+core)$/i;

const SCREEN_SUFFIX = /\s+(\d{1,2}(?:[.,]\d)?)\s*(?:"|''|”|″)\s*$/;

function caseSeries(word: string): string {
  return SERIES_CASING[word.toLowerCase()] ?? word;
}

export function parseFoxwayProductName(productName: string): ParsedProductName {
  let name = productName.replace(/\s+/g, " ").trim();

  const brandMulti = MULTI_WORD_BRANDS.find((b) => name.toLowerCase().startsWith(`${b.toLowerCase()} `));
  const brand = brandMulti ?? name.split(" ")[0] ?? "";
  name = name.slice(brand.length).trim();

  const apple = brand.toLowerCase() === "apple" ? parseAppleName(name) : null;
  if (apple) {
    const model = appleModelName(apple);
    return { brand, modelName: `${apple.series} ${model}`, screenSizeIn: apple.screenIn, touch: false, apple, fiveG: false };
  }

  let screenSizeIn: number | null = null;
  const screen = name.match(SCREEN_SUFFIX);
  if (screen) {
    screenSizeIn = Number(screen[1].replace(",", "."));
    name = name.slice(0, screen.index).trim();
  }
  const touch = /\bTouch\b/i.test(name);
  name = name.replace(/\s*\bTouch\b\s*/gi, " ").trim();
  const fiveG = /\b5G\b/i.test(name);

  // Sulud: "(11th Gen)" → "Gen 11" (ThinkPad X1 Carbon), kirjeldus → välja, muu (mudelikood) → jääb ilma sulgudeta
  name = name.replace(/\(([^)]*)\)/g, (_, inner: string) => {
    const text = inner.trim();
    const gen = text.match(/^(\d{1,2})(?:st|nd|rd|th)\s+gen$/i);
    if (gen) return ` Gen ${Number(gen[1])} `;
    if (DESCRIPTOR.test(text)) return " ";
    return ` ${text} `;
  });
  name = name.replace(/\b(\d{1,2})(?:st|nd|rd|th)\s+gen\b/gi, (_, n: string) => `Gen ${Number(n)}`);
  name = name.replace(/\s+/g, " ").trim();
  name = name.replace(/^(\S+)/, (word) => caseSeries(word));

  return { brand, modelName: name, screenSizeIn, touch, apple: null, fiveG };
}

const APPLE_NAME = /^(MacBook(?:\s+Air|\s+Pro)?)\s*\((.+)\)\s*$/i;

/** "Macbook Air", "(13" 2020, M1)" → võtmed. Ei sobi → null (siis käsitletakse tavalise nimena). */
export function parseAppleName(name: string): AppleNameKeys | null {
  const match = name.match(APPLE_NAME);
  if (!match) return null;
  const series = match[1].replace(/\s+/g, " ").replace(/^macbook/i, "MacBook").replace(/\b(air|pro)\b/i, (w) => w[0].toUpperCase() + w.slice(1).toLowerCase());
  const inner = match[2];
  const screen = inner.match(/(\d{2}(?:\.\d)?)\s*(?:"|''|”|″)/);
  const year = inner.match(/\b(?:(Early|Mid|Late)\s+)?((?:19|20)\d{2})\b/i);
  const chip = inner.match(/\bM(\d{1,2})(?:\s+(Pro|Max|Ultra))?\b/i);
  const ports = inner.match(/\b(\d)\s*TBT3\b/i);
  return {
    series,
    screenIn: screen ? Number(screen[1]) : null,
    year: year ? Number(year[2]) : null,
    season: year?.[1] ? year[1][0].toUpperCase() + year[1].slice(1).toLowerCase() : null,
    chip: chip ? `M${chip[1]}${chip[2] ? ` ${chip[2][0].toUpperCase()}${chip[2].slice(1).toLowerCase()}` : ""}` : null,
    ports: ports ? `${ports[1]} TBT3` : null,
  };
}

/** Apple mudelinimi (ilma seeriata): `13" 2020 M1`, `16" 2021 M1 Pro`, `13" 2020 (4 TBT3)`, `15" Mid 2015` */
export function appleModelName(keys: AppleNameKeys): string {
  return [keys.screenIn !== null ? `${keys.screenIn}"` : null, keys.season, keys.year, keys.chip, keys.ports ? `(${keys.ports})` : null].filter(Boolean).join(" ");
}

/**
 * Olemasoleva Apple mudeli vaste (Laptopid.ee mudelid on teise kirjapildiga, nt "MacBook Air M2 2022" 13.6").
 * Vaste ainult siis, kui seeria, aasta ja ekraani täisosa klapivad ning kiibi põlvkond ei ole vastuolus — ja
 * kandidaate on täpselt üks. Muidu uus mudel (parem uus mudel kui vale merge).
 */
export function matchAppleModel(
  keys: AppleNameKeys,
  candidates: { id: string; family: string; model: string; screenSizeIn: number | null }[],
): string | null {
  if (keys.year === null || keys.screenIn === null) return null;
  const chipGen = keys.chip?.match(/^M(\d+)/)?.[1] ?? null;
  const matches = candidates.filter((c) => {
    if (c.family.toLowerCase() !== keys.series.toLowerCase()) return false;
    const year = c.model.match(/\b((?:19|20)\d{2})\b/)?.[1];
    if (!year || Number(year) !== keys.year) return false;
    if (c.screenSizeIn === null || Math.floor(c.screenSizeIn) !== Math.floor(keys.screenIn!)) return false;
    const candidateChip = c.model.match(/\bM(\d+)\b/)?.[1] ?? null;
    // Kiip peab olema mõlemal sama põlvkond või mõlemal puudu (Intel); kiibita kandidaat M-kiibiga reale ei sobi
    return candidateChip === chipGen;
  });
  return matches.length === 1 ? matches[0].id : null;
}

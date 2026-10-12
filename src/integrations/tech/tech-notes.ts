/**
 * Tech hinnakirja märkuste (veerud K ja L) klassifitseerimine — tõstutundetu ja sõnapõhine (token-aware).
 *
 *   positiivsed tunnused   bl → taustavalgusega klaviatuur, id → Smart Card / ID-kaardi lugeja (EI OLE sõrmejälg),
 *                          4g → 4G/LTE, 5g → 5G
 *   defektid (välja)        dead battery, dead, no keyboard, missing keyboard, klava x, hinge, damage, laik, usb, fan,
 *                          touchbar x, screen, scr
 *   info (ignoreeritakse)   e, g, f, w, p (kasutaja otsus 2026-10-12: ei ole defekt, kliendile ei kuvata);
 *                          protsendid (26%) — säilivad toorandmetes, grade'i/hinda/laoseisu ei mõjuta;
 *                          laadija kirjeldus (hp 65w t.c., 65w blue, 135w square) — kõik Techi sülearvutid on laadijaga
 *   tundmatu                kõik muu → seade jääb müügist välja (UNKNOWN_NOTE), admin näeb toorväärtust.
 *                          Tähendust ei oletata: parem jätta seade välja kui müüa varjatud defektiga seadet.
 */

export const TECH_DEFECT_CODES = [
  "DEAD_BATTERY",
  "DEAD",
  "NO_KEYBOARD",
  "BROKEN_KEYBOARD",
  "HINGE",
  "DAMAGE",
  "SCREEN_SPOT",
  "USB",
  "FAN",
  "BROKEN_TOUCHBAR",
  "SCREEN",
  "SCR",
] as const;
export type TechDefectCode = (typeof TECH_DEFECT_CODES)[number];

export const TECH_DEFECT_LABELS: Record<TechDefectCode, string> = {
  DEAD_BATTERY: "Aku surnud",
  DEAD: "Seade vigane (dead)",
  NO_KEYBOARD: "Klaviatuur puudub",
  BROKEN_KEYBOARD: "Klaviatuur katki (klava x)",
  HINGE: "Hinge defekt",
  DAMAGE: "Füüsiline kahjustus",
  SCREEN_SPOT: "Ekraanil laik",
  USB: "USB/USB-port katki",
  FAN: "Ventilaator katki",
  BROKEN_TOUCHBAR: "Touch Bar katki",
  SCREEN: "Ekraaniviga",
  SCR: "Ekraan/kriimustus (scr)",
};

export interface TechNoteFeatures {
  backlit: boolean;
  smartcard: boolean;
  lte: boolean;
  fiveG: boolean;
}

export interface TechNoteResult {
  defects: TechDefectCode[];
  /** Tundmatud sõnad algkujul (väiketähtedega) */
  unknown: string[];
  features: TechNoteFeatures;
  /** Ignoreeritud infokoodid (e, g, f, w, p) */
  ignored: string[];
  percentages: string[];
  charger: string[];
}

/** Kahesõnalised defektid (kontrollitakse enne üksiksõnu) */
const DEFECT_PHRASES: { words: [string, RegExp]; code: TechDefectCode }[] = [
  { words: ["dead", /^batt?ery$/], code: "DEAD_BATTERY" },
  { words: ["no", /^(keyboard|klava)$/], code: "NO_KEYBOARD" },
  { words: ["missing", /^(keyboard|klava)$/], code: "NO_KEYBOARD" },
  { words: ["klava", /^x$/], code: "BROKEN_KEYBOARD" },
  { words: ["touchbar", /^x$/], code: "BROKEN_TOUCHBAR" },
];

const DEFECT_WORDS: { pattern: RegExp; code: TechDefectCode }[] = [
  { pattern: /^dead$/, code: "DEAD" },
  { pattern: /^hinges?$/, code: "HINGE" },
  { pattern: /^damaged?$/, code: "DAMAGE" },
  { pattern: /^laik$/, code: "SCREEN_SPOT" },
  { pattern: /^usb$/, code: "USB" },
  { pattern: /^fan$/, code: "FAN" },
  { pattern: /^screen$/, code: "SCREEN" },
  { pattern: /^scr$/, code: "SCR" },
];

const FEATURE_WORDS: Record<string, keyof TechNoteFeatures> = { bl: "backlit", id: "smartcard", "4g": "lte", "5g": "fiveG" };

/** Kasutaja otsusega ignoreeritavad ühetähelised infokoodid */
const IGNORED_CODES = new Set(["e", "g", "f", "w", "p"]);

const PERCENT = /^\d{1,3}%$/;
const WATTS = /^\d{2,3}w$/;
/** Laadija kirjeldust sisaldav märkus: "65w", "135 w" */
const CHARGER_NOTE = /\b\d{2,3}\s?w\b/i;
const CHARGER_WORDS = new Set(["hp", "dell", "lenovo", "fujitsu", "apple", "t.c.", "t.c", "tc", "type-c", "usb-c", "square", "round", "slim", "blue", "yellow", "orig", "original", "adapter", "charger"]);

function tokenize(note: string): string[] {
  return note
    .toLowerCase()
    .split(/[\s,;+/|]+/)
    .map((t) => t.trim())
    .filter(Boolean);
}

export function emptyTechNoteResult(): TechNoteResult {
  return { defects: [], unknown: [], features: { backlit: false, smartcard: false, lte: false, fiveG: false }, ignored: [], percentages: [], charger: [] };
}

/** Klassifitseerib ühe rea märkused (K ja L). Tühjad märkused → tühi tulemus. */
export function classifyTechNotes(notes: (string | null | undefined)[]): TechNoteResult {
  const result = emptyTechNoteResult();
  for (const note of notes) {
    if (!note?.trim()) continue;
    const tokens = tokenize(note);
    const chargerNote = CHARGER_NOTE.test(note);
    for (let i = 0; i < tokens.length; i++) {
      const token = tokens[i];
      const next = tokens[i + 1];
      const phrase = next !== undefined ? DEFECT_PHRASES.find((p) => p.words[0] === token && p.words[1].test(next)) : undefined;
      if (phrase) {
        result.defects.push(phrase.code);
        i++;
        continue;
      }
      const defect = DEFECT_WORDS.find((d) => d.pattern.test(token));
      if (defect) {
        result.defects.push(defect.code);
        continue;
      }
      const feature = FEATURE_WORDS[token];
      if (feature) {
        result.features[feature] = true;
        continue;
      }
      if (PERCENT.test(token)) {
        result.percentages.push(token);
        continue;
      }
      if (chargerNote && (WATTS.test(token) || CHARGER_WORDS.has(token) || (/^\d{2,3}$/.test(token) && next === "w"))) {
        result.charger.push(token);
        continue;
      }
      if (chargerNote && token === "w" && /^\d{2,3}$/.test(tokens[i - 1] ?? "")) {
        result.charger.push(token);
        continue;
      }
      if (IGNORED_CODES.has(token)) {
        result.ignored.push(token);
        continue;
      }
      result.unknown.push(token);
    }
  }
  result.defects = [...new Set(result.defects)];
  return result;
}

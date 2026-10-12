/**
 * Icecati vaste (match) mudeli ja Icecati toote vahel.
 *
 * Põhimõte: vale sülearvuti pilt on hullem kui placeholder.
 * Automaatselt läheb live'i ainult piisavalt kindel vaste, mille pealkiri on ka kontrollitud.
 *
 * NB! Icecat on meile MUDELIPILTIDE allikas. Icecati vaste on tihti üks konkreetne SKU
 * (nt Saksa klaviatuur, puuteekraan, teine RAM/SSD) — selle tehnilisi andmeid EI kasutata
 * meie müüdava seadme kirjeldamiseks. Seadme andmed tulevad alati tarnija pakkumisest.
 */

export const ICECAT_MATCH_TYPES = ["GTIN", "MPN", "ICECAT_ID", "MODEL_NAME", "MODEL_IDENTITY", "MANUAL"] as const;
export type IcecatMatchType = (typeof ICECAT_MATCH_TYPES)[number];

export const ICECAT_MATCH_STATUSES = [
  "MATCHED", // kindel vaste, pildid live'is
  "NEEDS_REVIEW", // leiti midagi, aga pole piisavalt kindel → admin otsustab
  "NOT_FOUND", // vastet pole (või pole identifikaatoreid)
  "ERROR", // tehniline viga (Icecat ei vasta, pildid ei lae)
  "REJECTED", // admin lükkas vaste tagasi
] as const;
export type IcecatMatchStatus = (typeof ICECAT_MATCH_STATUSES)[number];

/** Täpsustus, MIKS vaste puudub või ebaõnnestus (Data Quality vaate jaoks). */
export const ICECAT_STATUS_REASONS = [
  "NO_IDENTIFIERS", // mudelil pole GTIN-i, MPN-i ega Icecat ID-d
  "NOT_IN_ICECAT", // identifikaatorid olemas, Icecat ei leidnud
  "TITLE_MISMATCH", // leitud toote nimi ei vasta meie mudelile
  "LOW_CONFIDENCE", // ainult nimepõhine vaste
  "ICECAT_UNAVAILABLE", // Icecat ei vastanud (ajutine viga)
  "DOWNLOAD_FAILED", // vaste olemas, aga ühtegi pilti ei õnnestunud salvestada
] as const;
export type IcecatStatusReason = (typeof ICECAT_STATUS_REASONS)[number];

/** Baaskindlus identifikaatori tüübi järgi. */
export const MATCH_CONFIDENCE: Record<IcecatMatchType, number> = {
  MANUAL: 1,
  GTIN: 1,
  MPN: 0.95,
  ICECAT_ID: 0.9,
  MODEL_NAME: 0.7,
  // Indeksi mudelinimi + JSON pealkirja identiteedi kontroll (domain/images/model-identity.ts)
  MODEL_IDENTITY: 0.9,
};

/** Alates sellest kindlusest võib pildid automaatselt live'i panna. */
export const AUTO_ACCEPT_CONFIDENCE = 0.9;

export interface IcecatMatchRecord {
  productModelId: string;
  status: IcecatMatchStatus;
  reason: IcecatStatusReason | null;
  matchType: IcecatMatchType | null;
  confidence: number | null;
  icecatId: string | null;
  icecatTitle: string | null;
  /** Identifikaator, millega leiti (nt "MPN Lenovo 21AH00HNGE") */
  matchedBy: string | null;
  /** Kas Icecati pealkiri sisaldab meie mudeli nime */
  titleVerified: boolean | null;
  imageCount: number;
  checkedAt: string;
  error: string | null;
}

/**
 * Otsustab vaste staatuse.
 * MODEL_NAME vaste ei lähe kunagi automaatselt live'i; samuti mitte vaste, mille pealkiri ei klapi.
 */
export function decideMatch(
  matchType: IcecatMatchType,
  titleVerified: boolean,
): { status: "MATCHED" | "NEEDS_REVIEW"; confidence: number; reason: IcecatStatusReason | null } {
  if (matchType === "MANUAL") return { status: "MATCHED", confidence: 1, reason: null };
  const base = MATCH_CONFIDENCE[matchType];
  const confidence = titleVerified ? base : Math.round(base * 0.5 * 100) / 100;
  if (!titleVerified) return { status: "NEEDS_REVIEW", confidence, reason: "TITLE_MISMATCH" };
  if (confidence < AUTO_ACCEPT_CONFIDENCE) return { status: "NEEDS_REVIEW", confidence, reason: "LOW_CONFIDENCE" };
  return { status: "MATCHED", confidence, reason: null };
}

/** Normaliseerib teksti võrdlemiseks: "ThinkPad T14 Gen 3 (Intel)" → " thinkpad t14 gen 3 intel " */
function normalizeForMatch(text: string): string {
  return ` ${text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[®™]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()} `;
}

/**
 * Icecati pealkirjade teadaolevad erikujud:
 * - HP lisab mudelinimesse ekraani suuruse: "EliteBook 860 16 G10" → "elitebook 860 g10"
 */
function normalizeIcecatTitle(text: string): string {
  return normalizeForMatch(text).replace(/ (\d{3,4}) 1[3-7] (g\d{1,2}) /g, " $1 $2 ");
}

/** Mudelinime osad, mis Icecati pealkirjas võivad asuda mujal (nt "Hybrid (2-in-1)"). */
const DETACHABLE_QUALIFIERS = [" 2 in 1 "];

/**
 * Kas Icecati toote pealkiri vastab meie mudelile.
 * Võrdleme TERVETE sõnadena, et "ThinkPad T14 Gen 3" ei klapiks "ThinkPad T14s Gen 3" või
 * "EliteBook 840 G8" ei klapiks "EliteBook 840 Aero G8"-ga.
 */
export function titleMatchesModel(icecatText: string, brand: string, modelName: string): boolean {
  const haystack = normalizeIcecatTitle(icecatText);
  let core = normalizeForMatch(modelName);
  const qualifiers: string[] = [];
  for (const qualifier of DETACHABLE_QUALIFIERS) {
    if (core.endsWith(qualifier)) {
      core = `${core.slice(0, -qualifier.length)} `;
      qualifiers.push(qualifier);
    }
  }
  return (
    haystack.includes(normalizeForMatch(brand)) &&
    haystack.includes(core) &&
    qualifiers.every((qualifier) => haystack.includes(qualifier))
  );
}

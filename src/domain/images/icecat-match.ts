/**
 * Icecati vaste (match) mudeli ja Icecati toote vahel.
 *
 * Põhimõte: vale sülearvuti pilt on hullem kui placeholder.
 * Automaatselt läheb live'i ainult piisavalt kindel vaste, mille pealkiri on ka kontrollitud.
 */

export const ICECAT_MATCH_TYPES = ["GTIN", "MPN", "ICECAT_ID", "MODEL_NAME", "MANUAL"] as const;
export type IcecatMatchType = (typeof ICECAT_MATCH_TYPES)[number];

export const ICECAT_MATCH_STATUSES = [
  "MATCHED", // kinnitatud, pildid live'is
  "NEEDS_REVIEW", // leiti midagi, aga pole piisavalt kindel → admin otsustab
  "NOT_FOUND", // ükski identifikaator ei andnud tulemust
  "NO_IDENTIFIERS", // mudelil pole GTIN-i, MPN-i ega Icecat ID-d
  "DOWNLOAD_FAILED", // vaste olemas, aga ühtegi pilti ei õnnestunud alla laadida
  "REJECTED", // admin lükkas vaste tagasi
] as const;
export type IcecatMatchStatus = (typeof ICECAT_MATCH_STATUSES)[number];

/** Baaskindlus identifikaatori tüübi järgi. */
export const MATCH_CONFIDENCE: Record<IcecatMatchType, number> = {
  MANUAL: 1,
  GTIN: 1,
  MPN: 0.95,
  ICECAT_ID: 0.9,
  MODEL_NAME: 0.7,
};

/** Alates sellest kindlusest võib pildid automaatselt live'i panna. */
export const AUTO_ACCEPT_CONFIDENCE = 0.9;

export interface IcecatMatchRecord {
  productModelId: string;
  status: IcecatMatchStatus;
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
export function decideMatch(matchType: IcecatMatchType, titleVerified: boolean): { status: IcecatMatchStatus; confidence: number } {
  if (matchType === "MANUAL") return { status: "MATCHED", confidence: 1 };
  const base = MATCH_CONFIDENCE[matchType];
  const confidence = titleVerified ? base : Math.round(base * 0.5 * 100) / 100;
  const status = titleVerified && confidence >= AUTO_ACCEPT_CONFIDENCE ? "MATCHED" : "NEEDS_REVIEW";
  return { status, confidence };
}

/** Normaliseerib pealkirja võrdlemiseks: "ThinkPad T14 Gen 3 (Intel)" → "thinkpad t14 gen 3 intel" */
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
 * Kas Icecati toote pealkiri vastab meie mudelile.
 * Võrdleme TERVETE sõnadena, et "ThinkPad T14 Gen 3" ei klapiks "ThinkPad T14s Gen 3" või
 * "EliteBook 840 G8" ei klapiks "EliteBook 840 Aero G8"-ga.
 */
export function titleMatchesModel(icecatText: string, brand: string, modelName: string): boolean {
  const haystack = normalizeForMatch(icecatText);
  return haystack.includes(normalizeForMatch(brand)) && haystack.includes(normalizeForMatch(modelName));
}

import { decideMatch, type IcecatMatchStatus, type IcecatMatchType, titleMatchesModel } from "@/domain/images/icecat-match";
import { describeIdentifier, type IcecatIdentifier, type IcecatLookupResult, type IcecatProduct } from "./icecat-types";

/**
 * Leiab mudelile vastava Icecati toote.
 *
 * Prioriteet:
 *   0. admini kinnitatud Icecat ID (MANUAL)
 *   1. GTIN / EAN
 *   2. tootja kood (MPN) + bränd
 *   3. Icecat ID
 *   4. normaliseeritud bränd + mudel (MODEL_NAME) — Icecati JSON API ei toeta nimepõhist otsingut,
 *      seega see samm jääb alati admini ülevaatusele (vt docs/ARCHITECTURE.md).
 *
 * Iga leitud toote pealkirja võrreldakse meie mudeli nimega. Kui see ei klapi, ei lähe pildid
 * automaatselt live'i (NEEDS_REVIEW).
 */

export interface ModelForMatching {
  id: string;
  brandName: string;
  /** "ThinkPad T14 Gen 3" — mudeli nimi ilma brändita */
  modelName: string;
}

export interface ModelIdentifiers {
  gtins: string[];
  mpns: string[];
  icecatIds: string[];
  /** Admini kinnitatud vaste — kasutatakse esimesena */
  confirmedIcecatId?: string;
  /** Admini tagasi lükatud vasted — neid ei pakuta enam */
  rejectedIcecatIds?: string[];
}

export interface MatchAttempt {
  identifier: string;
  result: IcecatLookupResult["status"] | "REJECTED_BY_ADMIN" | "TITLE_MISMATCH";
  message?: string;
}

export type MatchOutcome =
  | {
      status: Extract<IcecatMatchStatus, "MATCHED" | "NEEDS_REVIEW">;
      matchType: IcecatMatchType;
      confidence: number;
      product: IcecatProduct;
      matchedBy: string;
      titleVerified: boolean;
      attempts: MatchAttempt[];
    }
  | { status: Extract<IcecatMatchStatus, "NOT_FOUND" | "NO_IDENTIFIERS">; attempts: MatchAttempt[]; error: string | null };

export interface IcecatLookup {
  getProduct(identifier: IcecatIdentifier): Promise<IcecatLookupResult>;
}

function normalizeGtin(raw: string): string | null {
  const digits = raw.replace(/\D/g, "");
  return digits.length >= 8 && digits.length <= 14 ? digits : null;
}

export function buildIdentifierQueue(model: ModelForMatching, ids: ModelIdentifiers): { identifier: IcecatIdentifier; matchType: IcecatMatchType }[] {
  const queue: { identifier: IcecatIdentifier; matchType: IcecatMatchType }[] = [];
  const seen = new Set<string>();
  const push = (identifier: IcecatIdentifier, matchType: IcecatMatchType) => {
    const key = describeIdentifier(identifier).toLowerCase();
    if (!seen.has(key)) {
      seen.add(key);
      queue.push({ identifier, matchType });
    }
  };

  if (ids.confirmedIcecatId) push({ kind: "ICECAT_ID", icecatId: ids.confirmedIcecatId }, "MANUAL");
  for (const raw of ids.gtins) {
    const gtin = normalizeGtin(raw);
    if (gtin) push({ kind: "GTIN", gtin }, "GTIN");
  }
  for (const mpn of ids.mpns) if (mpn.trim()) push({ kind: "MPN", brand: model.brandName, mpn: mpn.trim() }, "MPN");
  for (const icecatId of ids.icecatIds) if (/^\d+$/.test(icecatId)) push({ kind: "ICECAT_ID", icecatId }, "ICECAT_ID");
  return queue;
}

/**
 * Kontrollitav tekst: bränd + Icecati pealkiri. ProductName'i kasutatakse ainult siis, kui
 * pealkiri puudub — muidu piisaks ühe välja kokkulangevusest ja vastuoluline andmeleht läheks läbi.
 */
export function productTextForVerification(product: IcecatProduct): string {
  const info = product.GeneralInfo;
  return `${info.Brand} ${info.Title || info.ProductName}`;
}

export async function matchModel(model: ModelForMatching, ids: ModelIdentifiers, client: IcecatLookup): Promise<MatchOutcome> {
  const queue = buildIdentifierQueue(model, ids);
  const attempts: MatchAttempt[] = [];
  if (queue.length === 0) {
    return { status: "NO_IDENTIFIERS", attempts, error: "Mudelil pole GTIN-i, MPN-i ega Icecat ID-d" };
  }

  const rejected = new Set(ids.rejectedIcecatIds ?? []);
  let fallback = null as Extract<MatchOutcome, { product: IcecatProduct }> | null;

  for (const { identifier, matchType } of queue) {
    const description = describeIdentifier(identifier);
    const result = await client.getProduct(identifier);
    if (result.status !== "FOUND") {
      attempts.push({ identifier: description, result: result.status, message: result.message });
      continue;
    }

    const icecatId = result.product.GeneralInfo.IcecatId;
    if (rejected.has(icecatId) && matchType !== "MANUAL") {
      attempts.push({ identifier: description, result: "REJECTED_BY_ADMIN", message: `Icecat ID ${icecatId}` });
      continue;
    }

    const titleVerified = titleMatchesModel(productTextForVerification(result.product), model.brandName, model.modelName);
    const decision = decideMatch(matchType, titleVerified);
    attempts.push({ identifier: description, result: titleVerified ? "FOUND" : "TITLE_MISMATCH", message: result.product.GeneralInfo.Title });

    const outcome = {
      matchType,
      confidence: decision.confidence,
      product: result.product,
      matchedBy: description,
      titleVerified,
      attempts,
    };
    if (decision.status === "MATCHED") return { status: "MATCHED", ...outcome };
    // Ebakindel vaste: jätame meelde, aga proovime järgmisi identifikaatoreid
    fallback ??= { status: "NEEDS_REVIEW", ...outcome };
  }

  if (fallback) return fallback;
  const lastError = attempts.findLast((a) => a.result === "ERROR");
  return { status: "NOT_FOUND", attempts, error: lastError?.message ?? null };
}

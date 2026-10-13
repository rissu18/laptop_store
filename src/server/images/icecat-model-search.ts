import {
  buildModelIdentity,
  compareModelName,
  cpuEraConflict,
  cpuEraMatch,
  identityWords,
  titleHasIdentity,
  type IdentityVerdict,
  type ModelIdentity,
  type ModelIdentityInput,
} from "@/domain/images/model-identity";
import { codeMatchesIcecatName, consumerProductCode, titleHasProductCode, type ProductCode } from "@/domain/images/product-code";
import { resolveIcecatImages } from "@/integrations/icecat/icecat-image-resolver";
import { ICECAT_SUPPLIER_IDS, type IcecatIndexRow } from "@/integrations/icecat/icecat-index";
import type { IcecatMatchType } from "@/domain/images/icecat-match";
import type { IcecatLookup } from "@/integrations/icecat/icecat-matcher";
import type { IcecatProduct } from "@/integrations/icecat/icecat-types";

/**
 * Icecati toote leidmine TOOTJA + MUDELI IDENTITEEDI järgi (kui GTIN/MPN puudub):
 *
 *   1. Icecati indeksi voog (sülearvutid + meie tootjad) → iga rida võrreldakse rikastust vajavate mudelitega
 *      (`compareModelName`); iga mudeli kohta hoitakse ainult paar parimat kandidaati (mitte indeksi koopiat).
 *   2. Kandidaatide JSON-andmeleht (icecat_id) → pealkiri peab sisaldama meie mudeli identiteeti (`titleHasIdentity`)
 *      ja seal ei tohi olla teist korpust (Chromebook, Rugged, x360 …).
 *   3. Kontrollitud kandidaatidest valitakse suurima kasutatava galeriiga (sama mudeli SKU-de galeriid erinevad).
 *
 * Lisaks nimele (domain/images/model-identity.ts):
 *   - PRODUCT_CODE: tarbijamudelid tootekoodi järgi (domain/images/product-code.ts: "SF314-52" ↔ "SF314-52-567W"),
 *     pealkirja kontroll titleHasProductCode;
 *   - FIRST_GEN: Lenovo "Gen 1" ↔ Icecati nimi ilma põlvkonnata — ainult pealkirjas põlvkonda pole JA protsessori ajastu
 *     on täpselt sama (cpuEraMatch); muidu NEEDS_REVIEW.
 *
 * Ebakindel → NEEDS_REVIEW (pilte ei lisata). Parem 0 pilti kui vale mudeli 10 pilti.
 */

export const MODEL_IDENTITY_MATCH_TYPE: IcecatMatchType = "MODEL_IDENTITY";
/** Mitu kandidaati mudeli kohta voos alles hoitakse / mitu JSON-andmelehte maksimaalselt küsitakse */
const KEEP_PER_MODEL = 8;
const DEFAULT_MAX_LOOKUPS = 5;

export interface SearchableModel extends ModelIdentityInput {
  /** Mudeli slug */
  id: string;
}

export type CandidateVerdict = Exclude<IdentityVerdict, "REJECT"> | "PRODUCT_CODE";

export interface IndexCandidate {
  row: IcecatIndexRow;
  verdict: CandidateVerdict;
  reason: string;
}

// Tootekood on tarbijamudelil tugevam tunnus kui turundusnimi ("Galaxy Book2 Pro" on 13" ja 15", NP950XED ainult 15")
const VERDICT_RANK: Record<CandidateVerdict, number> = { PRODUCT_CODE: 4, EXACT: 3, FAMILY_MISSING: 2, FIRST_GEN: 1, REVIEW: 0 };

const QUALITY_RANK: Record<string, number> = { ICECAT: 3, SUPPLIER: 2 };

/** Järjestus: täpne nimi → toimetatud (ICECAT) andmeleht → suur pilt → turul → uuem */
export function candidateRank(c: IndexCandidate): number[] {
  return [
    VERDICT_RANK[c.verdict],
    QUALITY_RANK[c.row.quality] ?? 0,
    c.row.limited ? 0 : 1,
    c.row.hasHighPic ? 1 : 0,
    c.row.onMarket ? 1 : 0,
    Number(c.row.updated) || 0,
  ];
}

function compareRank(a: IndexCandidate, b: IndexCandidate): number {
  const ra = candidateRank(a);
  const rb = candidateRank(b);
  for (let i = 0; i < ra.length; i++) if (ra[i] !== rb[i]) return rb[i] - ra[i];
  return 0;
}

/** Kogub indeksi voost iga mudeli parimad kandidaadid (mälus ainult KEEP_PER_MODEL rida mudeli kohta). */
export class IcecatIndexCandidates {
  private readonly identities = new Map<string, ModelIdentity>();
  /** "supplierId:token" → mudelid, mille identiteedis see numbriga sõna on (kiire eelvalik) */
  private readonly anchors = new Map<string, string[]>();
  private readonly candidates = new Map<string, IndexCandidate[]>();
  private readonly distinctNames = new Map<string, Set<string>>();
  /** Mudelid, mille põlvkonnata nimel on Icecatis põlvkonnaga variandid ("X13" vs "X13 Gen 2") */
  private readonly generationVariants = new Set<string>();
  /** Tarbijamudelite tootekood (mudel → kood) ja tootja → koodiga mudelid */
  private readonly productCodes = new Map<string, ProductCode>();
  private readonly codeModels = new Map<string, string[]>();
  readonly supplierIds = new Set<string>();

  constructor(models: SearchableModel[]) {
    for (const model of models) {
      const supplierId = ICECAT_SUPPLIER_IDS[model.manufacturer.toLowerCase()];
      if (!supplierId) continue;
      const identity = buildModelIdentity(model);
      const anchorTokens = identity.tokens.filter((t) => /\d/.test(t));
      if (!anchorTokens.length) continue; // ilma numbrita mudelinimi ("Surface Laptop") on liiga üldine
      this.identities.set(model.id, identity);
      this.supplierIds.add(supplierId);
      const code = consumerProductCode(model);
      if (code) {
        this.productCodes.set(model.id, code);
        this.codeModels.set(supplierId, [...(this.codeModels.get(supplierId) ?? []), model.id]);
      }
      for (const token of anchorTokens) {
        const key = `${supplierId}:${token}`;
        this.anchors.set(key, [...(this.anchors.get(key) ?? []), model.id]);
      }
    }
  }

  has(modelId: string): boolean {
    return this.identities.has(modelId);
  }

  identity(modelId: string): ModelIdentity | null {
    return this.identities.get(modelId) ?? null;
  }

  productCode(modelId: string): ProductCode | null {
    return this.productCodes.get(modelId) ?? null;
  }

  consider(row: IcecatIndexRow): void {
    const seen = new Set<string>();
    const added = new Set<string>();
    for (const word of new Set(identityWords(row.modelName))) {
      for (const modelId of this.anchors.get(`${row.supplierId}:${word}`) ?? []) {
        if (seen.has(modelId)) continue;
        seen.add(modelId);
        const result = compareModelName(this.identities.get(modelId)!, row.modelName);
        if (result.generationVariant) this.generationVariants.add(modelId);
        if (result.verdict === "REJECT") continue;
        this.add(modelId, { row, verdict: result.verdict, reason: result.reason });
        added.add(modelId);
      }
    }
    // Tarbijamudelid: SKU järelliitega Icecati nimi ("SF314-52-567W") — nimevõrdlus loeks järelliite teiseks mudeliks
    for (const modelId of this.codeModels.get(row.supplierId) ?? []) {
      if (added.has(modelId)) continue;
      const code = this.productCodes.get(modelId)!;
      if (codeMatchesIcecatName(code, this.identities.get(modelId)!, row.modelName, row.prodId)) {
        this.add(modelId, { row, verdict: "PRODUCT_CODE", reason: `tootekood ${code.code.toUpperCase()}` });
      }
    }
  }

  private add(modelId: string, candidate: IndexCandidate): void {
    const list = this.candidates.get(modelId) ?? [];
    list.push(candidate);
    list.sort(compareRank);
    if (list.length > KEEP_PER_MODEL) list.length = KEEP_PER_MODEL;
    this.candidates.set(modelId, list);
    const names = this.distinctNames.get(modelId) ?? new Set();
    if (names.size < 20) names.add(candidate.row.modelName);
    this.distinctNames.set(modelId, names);
  }

  candidatesFor(modelId: string): IndexCandidate[] {
    return this.candidates.get(modelId) ?? [];
  }

  hasGenerationVariants(modelId: string): boolean {
    return this.generationVariants.has(modelId);
  }

  namesFor(modelId: string): string[] {
    return [...(this.distinctNames.get(modelId) ?? [])];
  }
}

export type IdentitySearchResult =
  | {
      status: "MATCHED";
      product: IcecatProduct;
      candidate: IndexCandidate;
      imageCount: number;
      lookups: number;
      matchedBy: string;
      confidence: number;
    }
  | {
      status: "NEEDS_REVIEW";
      candidate: IndexCandidate;
      title: string | null;
      reason: string;
      lookups: number;
    }
  | { status: "NOT_FOUND"; reason: string; lookups: number }
  | { status: "ERROR"; reason: string; lookups: number };

/**
 * Kontrollib kandidaate JSON API kaudu ja valib kindla vaste. Pealkirja kontroll on kohustuslik ka täpse
 * indeksinime korral (indeksis puudub nt Dellil seeria: "5430" võib olla Latitude või Precision).
 */
export async function resolveByIdentity(
  identity: ModelIdentity,
  candidates: IndexCandidate[],
  client: IcecatLookup,
  options: {
    maxLookups?: number;
    rejectedIcecatIds?: Set<string>;
    targetImages?: number;
    /** Meie pakkumiste CPU-d — Icecati toote CPU teisest ajastust → mitte meie mudel (sama nimi, teine aasta) */
    ourCpus?: string[];
    /** Põlvkonnata mudelinimi, Icecatis mitu põlvkonda → ülevaatus */
    ambiguousGeneration?: boolean;
    /** Tarbijamudeli tootekood (PRODUCT_CODE kandidaatide pealkirja kontroll) */
    productCode?: ProductCode | null;
  } = {},
): Promise<IdentitySearchResult> {
  const usable = candidates.filter((c) => c.verdict !== "REVIEW" && !options.rejectedIcecatIds?.has(c.row.productId));
  const reviewOnly = candidates.find((c) => c.verdict === "REVIEW");
  if (!usable.length) {
    if (reviewOnly) return { status: "NEEDS_REVIEW", candidate: reviewOnly, title: reviewOnly.row.modelName, reason: reviewOnly.reason, lookups: 0 };
    return { status: "NOT_FOUND", reason: "Icecati indeksis sobivat mudelinime pole", lookups: 0 };
  }
  if (options.ambiguousGeneration) {
    return { status: "NEEDS_REVIEW", candidate: usable[0], title: usable[0].row.modelName, reason: "meie mudelinimes pole põlvkonda, Icecatis on sama mudel mitme põlvkonnaga", lookups: 0 };
  }

  const maxLookups = options.maxLookups ?? DEFAULT_MAX_LOOKUPS;
  const target = options.targetImages ?? 10;
  let lookups = 0;
  let errors = 0;
  let best: { product: IcecatProduct; candidate: IndexCandidate; imageCount: number } | null = null;
  let firstMismatch: { candidate: IndexCandidate; title: string } | null = null;

  for (const candidate of usable.slice(0, maxLookups)) {
    lookups++;
    const result = await client.getProduct({ kind: "ICECAT_ID", icecatId: candidate.row.productId });
    if (result.status === "ERROR") {
      errors++;
      continue;
    }
    if (result.status !== "FOUND") continue;
    const title = `${result.product.GeneralInfo.Brand} ${result.product.GeneralInfo.Title || result.product.GeneralInfo.ProductName}`;
    const titleOk =
      candidate.verdict === "PRODUCT_CODE"
        ? Boolean(options.productCode) && titleHasProductCode(options.productCode!, identity, title)
        : titleHasIdentity(identity, title, { firstGenUnnamed: candidate.verdict === "FIRST_GEN" });
    if (!titleOk) {
      firstMismatch ??= { candidate, title };
      continue;
    }
    // FIRST_GEN: põlvkonnata Icecati nimi on lubatud ainult TÄPSELT sama protsessori ajastuga (lisatõend)
    if (candidate.verdict === "FIRST_GEN" && !(options.ourCpus?.length && cpuEraMatch(title, options.ourCpus))) {
      firstMismatch ??= { candidate, title: `${title} (protsessori ajastu ei kinnita 1. põlvkonda)` };
      continue;
    }
    if (options.ourCpus?.length && cpuEraConflict(title, options.ourCpus)) {
      firstMismatch ??= { candidate, title: `${title} (protsessor teisest ajastust)` };
      continue;
    }
    const imageCount = resolveIcecatImages(result.product).length;
    if (!best || imageCount > best.imageCount) best = { product: result.product, candidate, imageCount };
    if (imageCount >= target) break;
  }

  if (best && best.imageCount > 0) {
    const how = { EXACT: "mudelinimi", FAMILY_MISSING: "number + pealkirja seeria", FIRST_GEN: "1. põlvkond + protsessori ajastu", PRODUCT_CODE: "tootekood + pealkiri", REVIEW: "" }[best.candidate.verdict];
    return {
      status: "MATCHED",
      product: best.product,
      candidate: best.candidate,
      imageCount: best.imageCount,
      lookups,
      matchedBy: `Icecat ${how}: "${best.candidate.row.modelName}" (#${best.candidate.row.productId}, ${best.candidate.row.quality})`,
      confidence: best.candidate.verdict === "EXACT" ? 0.92 : best.candidate.verdict === "FAMILY_MISSING" ? 0.9 : 0.85,
    };
  }
  if (firstMismatch) {
    return { status: "NEEDS_REVIEW", candidate: firstMismatch.candidate, title: firstMismatch.title, reason: "Icecati pealkiri ei kinnita mudelit (teine seeria/korpus?)", lookups };
  }
  if (best) return { status: "NOT_FOUND", reason: "Vaste leitud, aga Icecatil pole kasutatavaid pilte", lookups };
  if (errors) return { status: "ERROR", reason: "Icecat ei vastanud", lookups };
  return { status: "NOT_FOUND", reason: "Icecati andmelehti ei saanud lugeda", lookups };
}

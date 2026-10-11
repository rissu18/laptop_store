import { z } from "zod";
import { laptopidImageSchema, laptopidProductSchema, type LaptopidImage } from "./laptopid-schema";
import { LaptopidNormalizationError, laptopidExternalId, normalizeLaptopidProduct, type LaptopidOffer } from "./laptopid-normalizer";

/**
 * Laptopid.ee vastus → valideeritud snapshot + usaldusväärsuse otsus.
 *
 * API-l pole `snapshot_complete` vms markerit, seega on täielikkuse kontroll konservatiivne:
 *   1. mõlemad vastused on JSON massiivid; tooteid on vähemalt 1; ID-d on unikaalsed  → muidu VIGA (DB ei muutu)
 *   2. skeemivigaste kirjete osakaal ≤ MAX_INVALID_RATIO                               → muidu VIGA (API vorming muutus)
 *   3. "puuduvad" = varem saadaval olnud pakkumised, mille ID-d vastuses POLE (ka vigase kirjena)
 *      Kui neid on rohkem kui max(MAX_MISSING_ABSOLUTE, MAX_MISSING_RATIO × varem saadaval),
 *      ei peeta snapshot'i täielikuks: olemasolevad uuendatakse, aga kedagi maha EI võeta
 *      (admin saab suure muutuse teadlikult kinnitada: allowLargeDrop).
 * Vastuses olev, aga vigane kirje ei ole "puuduv" — selle eelmine seis jääb alles.
 */

export const MAX_INVALID_RATIO = 0.05;
export const MAX_MISSING_ABSOLUTE = 10;
export const MAX_MISSING_RATIO = 0.25;

export type SnapshotErrorCode = "NOT_ARRAY" | "EMPTY" | "DUPLICATE_IDS" | "TOO_MANY_INVALID";

export class LaptopidSnapshotError extends Error {
  constructor(
    public readonly code: SnapshotErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "LaptopidSnapshotError";
  }
}

export interface SnapshotRejection {
  externalId: string | null;
  stage: "validate" | "normalize";
  message: string;
}

export interface LaptopidSnapshot {
  /** Kõik vastuses olnud toote-ID-d (ka vigased) — puuduvate arvutamiseks */
  receivedIds: Set<string>;
  receivedCount: number;
  offers: LaptopidOffer[];
  rejected: SnapshotRejection[];
  imageCount: number;
  invalidImages: number;
}

const idOf = (raw: unknown): string | null => {
  if (raw && typeof raw === "object" && "id" in raw) {
    const id = (raw as { id: unknown }).id;
    if ((typeof id === "number" && Number.isInteger(id) && id > 0) || (typeof id === "string" && /^\d{1,12}$/.test(id.trim()))) return laptopidExternalId(id);
  }
  return null;
};

export function parseLaptopidSnapshot(productsJson: unknown, imagesJson: unknown): LaptopidSnapshot {
  if (!Array.isArray(productsJson)) throw new LaptopidSnapshotError("NOT_ARRAY", "Toodete vastus ei ole massiiv");
  if (!Array.isArray(imagesJson)) throw new LaptopidSnapshotError("NOT_ARRAY", "Piltide vastus ei ole massiiv");
  if (productsJson.length === 0) throw new LaptopidSnapshotError("EMPTY", "Toodete nimekiri on tühi");

  const receivedIds = new Set<string>();
  for (const raw of productsJson) {
    const id = idOf(raw);
    if (id === null) continue;
    if (receivedIds.has(id)) throw new LaptopidSnapshotError("DUPLICATE_IDS", `Toote ID ${id} esineb vastuses mitu korda`);
    receivedIds.add(id);
  }

  const imagesByProduct = new Map<string, LaptopidImage[]>();
  let invalidImages = 0;
  for (const raw of imagesJson) {
    const parsed = laptopidImageSchema.safeParse(raw);
    if (!parsed.success) {
      invalidImages++;
      continue;
    }
    const key = laptopidExternalId(parsed.data.product_id);
    imagesByProduct.set(key, [...(imagesByProduct.get(key) ?? []), parsed.data]);
  }

  const offers: LaptopidOffer[] = [];
  const rejected: SnapshotRejection[] = [];
  for (const raw of productsJson) {
    const parsed = laptopidProductSchema.safeParse(raw);
    if (!parsed.success) {
      rejected.push({ externalId: idOf(raw), stage: "validate", message: formatIssue(parsed.error) });
      continue;
    }
    const externalId = laptopidExternalId(parsed.data.id);
    try {
      offers.push(normalizeLaptopidProduct(parsed.data, imagesByProduct.get(externalId) ?? []));
    } catch (error) {
      if (!(error instanceof LaptopidNormalizationError)) throw error;
      rejected.push({ externalId, stage: "normalize", message: error.message });
    }
  }

  const invalid = rejected.filter((r) => r.stage === "validate").length;
  if (invalid / productsJson.length > MAX_INVALID_RATIO) {
    throw new LaptopidSnapshotError("TOO_MANY_INVALID", `Liiga palju skeemivigaseid kirjeid (${invalid}/${productsJson.length}) — API vorming võis muutuda`);
  }

  return { receivedIds, receivedCount: productsJson.length, offers, rejected, imageCount: imagesJson.length, invalidImages };
}

function formatIssue(error: z.ZodError): string {
  const issue = error.issues[0];
  return issue ? `${issue.path.join(".") || "kirje"}: ${issue.message}` : "Vigane kirje";
}

export interface TrustDecision {
  trusted: boolean;
  /** Pakkumised, mis võetakse maha (ainult kui trusted) */
  missingIds: string[];
  reason: string | null;
}

/**
 * @param previouslyAvailable — Laptopid pakkumiste externalId-d, mis on praegu andmebaasis saadaval
 */
export function decideSnapshotTrust(snapshot: Pick<LaptopidSnapshot, "receivedIds">, previouslyAvailable: string[], options: { allowLargeDrop?: boolean } = {}): TrustDecision {
  const missingIds = previouslyAvailable.filter((id) => !snapshot.receivedIds.has(id));
  const limit = Math.max(MAX_MISSING_ABSOLUTE, Math.ceil(previouslyAvailable.length * MAX_MISSING_RATIO));
  if (missingIds.length > limit && !options.allowLargeDrop) {
    return {
      trusted: false,
      missingIds,
      reason: `Snapshot'ist puudub ${missingIds.length} varem saadaval olnud toodet (lubatud kuni ${limit}) — puuduvaid maha ei võetud`,
    };
  }
  return { trusted: true, missingIds, reason: null };
}

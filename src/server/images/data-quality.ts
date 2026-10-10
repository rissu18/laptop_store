import type { IcecatMatchRecord, IcecatMatchStatus } from "@/domain/images/icecat-match";
import { visibleImages, type ProductImageRecord } from "@/domain/images/product-image";

/**
 * Data Quality ülevaade tootepiltide kohta.
 * Kasutavad: käsurida (`npm run icecat -- status`), raport ja arenduse admin-vaade.
 * Phase 3 adminpaneel kasutab sama funktsiooni.
 */

export interface DataQualityModel {
  id: string;
  title: string;
  /** Mitu tarnija pakkumist (konfiguratsiooni) seda mudelit kasutab */
  listingCount: number;
}

export interface DataQualityRow extends DataQualityModel {
  match: IcecatMatchRecord | null;
  /** Kuvatavad pildid (peidetud välja arvatud) */
  imageCount: number;
  hiddenCount: number;
}

export interface DataQualityOverview {
  modelsTotal: number;
  images: { withImages: number; withoutImages: number; coveragePct: number };
  icecat: Record<IcecatMatchStatus | "NOT_CHECKED", number>;
  gallery: { mainImageOnly: number; multipleImages: number; averageImages: number };
  rows: DataQualityRow[];
  modelsWithoutImages: DataQualityRow[];
}

const pct = (part: number, total: number) => (total === 0 ? 0 : Math.round((part / total) * 1000) / 10);

export function buildDataQualityOverview(
  models: DataQualityModel[],
  matches: IcecatMatchRecord[],
  images: Record<string, ProductImageRecord[]>,
): DataQualityOverview {
  const matchByModel = new Map(matches.map((m) => [m.productModelId, m]));
  const rows: DataQualityRow[] = models.map((model) => {
    const all = images[model.id] ?? [];
    const visible = visibleImages(all);
    return { ...model, match: matchByModel.get(model.id) ?? null, imageCount: visible.length, hiddenCount: all.length - visible.length };
  });

  const icecat: DataQualityOverview["icecat"] = { MATCHED: 0, NEEDS_REVIEW: 0, NOT_FOUND: 0, ERROR: 0, REJECTED: 0, NOT_CHECKED: 0 };
  for (const row of rows) icecat[row.match?.status ?? "NOT_CHECKED"]++;

  const withImages = rows.filter((r) => r.imageCount > 0);
  return {
    modelsTotal: rows.length,
    images: { withImages: withImages.length, withoutImages: rows.length - withImages.length, coveragePct: pct(withImages.length, rows.length) },
    icecat,
    gallery: {
      mainImageOnly: rows.filter((r) => r.imageCount === 1).length,
      multipleImages: rows.filter((r) => r.imageCount > 1).length,
      averageImages: withImages.length ? Math.round((withImages.reduce((s, r) => s + r.imageCount, 0) / withImages.length) * 10) / 10 : 0,
    },
    rows,
    modelsWithoutImages: rows.filter((r) => r.imageCount === 0),
  };
}

/** Eestikeelne selgitus Data Quality vaatesse. */
export function describeReason(match: IcecatMatchRecord | null): string {
  if (!match) return "Icecatist pole veel otsitud";
  switch (match.reason) {
    case "NO_IDENTIFIERS":
      return "Puudub GTIN, tootja kood ja Icecat ID — lisa identifikaator või käsitsi vaste";
    case "NOT_IN_ICECAT":
      return "Icecat ei leidnud ühegi identifikaatoriga";
    case "TITLE_MISMATCH":
      return "Leitud toote nimi ei vasta mudelile — kontrolli ja kinnita või lükka tagasi";
    case "LOW_CONFIDENCE":
      return "Ainult nimepõhine vaste — vajab kinnitust";
    case "ICECAT_UNAVAILABLE":
      return "Icecat ei vastanud — proovi hiljem uuesti";
    case "DOWNLOAD_FAILED":
      return "Vaste olemas, aga pilte ei õnnestunud salvestada";
    default:
      return match.status === "REJECTED" ? "Admin lükkas vaste tagasi" : "";
  }
}

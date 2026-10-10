import type { IcecatMatchRecord } from "@/domain/images/icecat-match";

/**
 * Admini "Data Quality" vaate andmed (Phase 3 admin kasutab sama funktsiooni).
 * Praegu kuvatakse käsurealt: npm run icecat -- status
 */

export const DATA_QUALITY_GROUPS = [
  { key: "withoutImage", label: "Mudelid ilma pildita" },
  { key: "matchFailed", label: "Icecati vastet ei leitud" },
  { key: "needsReview", label: "Icecati vaste vajab ülevaatust" },
  { key: "downloadFailed", label: "Piltide allalaadimine ebaõnnestus" },
  { key: "matched", label: "Icecati vaste olemas" },
] as const;

export type DataQualityGroup = (typeof DATA_QUALITY_GROUPS)[number]["key"];

export interface DataQualityRow {
  modelId: string;
  title: string;
  match: IcecatMatchRecord | null;
  imageCount: number;
}

export function buildDataQualityOverview(
  models: { id: string; title: string }[],
  matches: IcecatMatchRecord[],
  imageCounts: Record<string, number>,
): Record<DataQualityGroup, DataQualityRow[]> {
  const byModel = new Map(matches.map((m) => [m.productModelId, m]));
  const groups: Record<DataQualityGroup, DataQualityRow[]> = {
    withoutImage: [],
    matchFailed: [],
    needsReview: [],
    downloadFailed: [],
    matched: [],
  };

  for (const model of models) {
    const match = byModel.get(model.id) ?? null;
    const row: DataQualityRow = { modelId: model.id, title: model.title, match, imageCount: imageCounts[model.id] ?? 0 };
    if (row.imageCount === 0) groups.withoutImage.push(row);
    switch (match?.status) {
      case "MATCHED":
        groups.matched.push(row);
        break;
      case "NEEDS_REVIEW":
        groups.needsReview.push(row);
        break;
      case "DOWNLOAD_FAILED":
        groups.downloadFailed.push(row);
        break;
      case "NOT_FOUND":
      case "NO_IDENTIFIERS":
      case "REJECTED":
        groups.matchFailed.push(row);
        break;
      default:
        break; // pole veel kontrollitud → ainult "ilma pildita"
    }
  }
  return groups;
}

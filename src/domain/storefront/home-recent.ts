import { businessSeriesValues } from "@/domain/catalog/business-series";
import { emptyQuery, type CatalogQuery } from "@/domain/catalog/query";
import { GRADES, type GradeCode } from "@/domain/grade/grades";

/**
 * Avalehe "Viimati lisatud" ärireegel (ainult avalehe valik — kataloogist ei eemaldata midagi):
 *  - seisukord vähemalt B (Uus, A+, A, B);
 *  - äriklassi seeria (sama nimekiri mis "Populaarsed äriklassi seeriad": ThinkPad, Latitude, Precision, EliteBook, ProBook, ZBook);
 *  - protsessori põlvkond vähemalt Intel 8. / AMD Ryzen 2000 (gen_rank ≥ 8 — Windows 11 tugi), et vanad mudelid ei tuleks ette;
 *  - igast mudelist üks, uuemad enne.
 * "Kõik uued" link avab endiselt kogu kataloogi uuemad enne.
 */
export const HOME_RECENT_GRADES: GradeCode[] = ["NEW", "A+", "A", "B"];
export const HOME_RECENT_MIN_GEN_RANK = 8;

export function homeRecentQuery(): CatalogQuery {
  const query = emptyQuery();
  return {
    ...query,
    sort: "recently-added",
    facets: { ...query.facets, grade: HOME_RECENT_GRADES.map((code) => GRADES[code].param), series: businessSeriesValues() },
  };
}

/** Sama reegel ühe kirje kohta (testid, mock-kataloog). */
export function isHomeRecentCandidate(item: { grade: string; seriesValue: string; genRank: number | null }): boolean {
  return (HOME_RECENT_GRADES as string[]).includes(item.grade) && businessSeriesValues().includes(item.seriesValue) && (item.genRank ?? 0) >= HOME_RECENT_MIN_GEN_RANK;
}

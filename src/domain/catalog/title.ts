/**
 * Toote pealkiri (ja sellest tuletatud mudeli slug): tootja + seeria + mudel.
 * Seeriat ei korrata, kui see on mudelinimes juba olemas või kui seeria on ainult rühmitamiseks:
 *   "Lenovo" + "ThinkPad" + "T14 Gen 3"     → "Lenovo ThinkPad T14 Gen 3"
 *   "Lenovo" + "V Series" + "V330-14IKB"    → "Lenovo V330-14IKB"
 *   "Lenovo" + "IdeaPad" + "IdeaPad 5 14"   → "Lenovo IdeaPad 5 14"   (tundmatu seeria tagavara)
 * "ThinkPad P" seeria "P" ei lähe pealkirja (mudel on "P1 Gen 4").
 */
const SERIES_NOT_IN_TITLE = new Set(["V Series"]);

export function productTitle(brandName: string, series: string, model: string): string {
  const shownSeries = series.replace(/ P$/, "");
  if (SERIES_NOT_IN_TITLE.has(series) || model.toLowerCase().startsWith(shownSeries.toLowerCase())) return `${brandName} ${model}`;
  return `${brandName} ${shownSeries} ${model}`;
}

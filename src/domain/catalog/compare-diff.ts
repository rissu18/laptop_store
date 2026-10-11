/**
 * Võrdlustabeli erinevused: kas reas on väärtused erinevad ja millised väärtused on omavahel võrdsed.
 * Tähendus on ainult "need väärtused ei ole samad" — mitte "parem/halvem".
 */

/** Sama väärtuse eri kirjapildid ("16 GB" / "16GB", "1920 × 1080" / "1920x1080") loetakse võrdseks */
export function normalizeCompareValue(value: string): string {
  return value
    .normalize("NFC")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim()
    .replace(/(\d)\s*[×x]\s*(\d)/g, "$1x$2")
    .replace(/(\d)\s+(gb|tb|mb|kg|g|ghz|mhz|hz|w|wh|mm|tolli|")/g, "$1$2");
}

/**
 * Iga toote väärtuse rühm (0, 1, 2 …) esmakordse esinemise järjekorras; kui kõik väärtused on samad
 * (või tooteid on alla kahe), siis `null` kõigile — rida jääb neutraalseks.
 *   ["16 GB", "32 GB", "16GB"] → [0, 1, 0]
 */
export function differenceGroups(values: string[]): (number | null)[] {
  const normalized = values.map(normalizeCompareValue);
  if (values.length < 2 || new Set(normalized).size <= 1) return values.map(() => null);
  const groups = new Map<string, number>();
  return normalized.map((value) => {
    if (!groups.has(value)) groups.set(value, groups.size);
    return groups.get(value)!;
  });
}

export function rowHasDifferences(values: string[]): boolean {
  return differenceGroups(values).some((group) => group !== null);
}

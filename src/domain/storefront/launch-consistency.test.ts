import { describe, expect, it } from "vitest";
import { displayRange, roundRange } from "@/components/catalog/price-range-slider";
import { GRADES, GRADE_CODES } from "@/domain/grade/grades";
import { configurationCountLabel } from "./count-labels";
import { isHomeRecentCandidate } from "./home-recent";

describe("ühtne terminoloogia", () => {
  it("loendur = konfiguratsioonid", () => {
    expect(configurationCountLabel(835)).toBe("835 konfiguratsiooni");
    expect(configurationCountLabel(1)).toBe("1 konfiguratsioon");
  });
});

describe("hinnavahemik: liuguri piiril tegelik kataloogi hind", () => {
  it("131–3310 € → samm 10 €, aga kuvatakse 131 € ja 3305 €", () => {
    const raw = { min: 131, max: 3305 };
    const bounds = roundRange(raw);
    expect(bounds).toEqual({ min: 130, max: 3310 });
    expect(displayRange(bounds.min, bounds.max, bounds, raw)).toEqual({ lo: 131, hi: 3305 });
    expect(displayRange(500, 1000, bounds, raw)).toEqual({ lo: 500, hi: 1000 });
  });
});

describe("seisukorra klassid", () => {
  it("näidistekste ega placeholder'eid pole", () => {
    for (const code of GRADE_CODES) {
      const grade = GRADES[code];
      expect(grade.isPlaceholder).toBe(false);
      expect(`${grade.description} ${grade.criteria.join(" ")}`).not.toMatch(/näidistekst|näidiskriteerium|placeholder|todo/i);
      expect(grade.criteria.length).toBeGreaterThan(0);
    }
  });
});

describe("avalehe Viimati lisatud reegel", () => {
  it("äriklass, seisukord ≥ B, protsessor ≥ Intel 8. / Ryzen 2000", () => {
    expect(isHomeRecentCandidate({ grade: "A", seriesValue: "thinkpad-t", genRank: 11 })).toBe(true);
    expect(isHomeRecentCandidate({ grade: "B", seriesValue: "latitude", genRank: 8 })).toBe(true);
    expect(isHomeRecentCandidate({ grade: "C", seriesValue: "latitude", genRank: 12 })).toBe(false);
    expect(isHomeRecentCandidate({ grade: "C+", seriesValue: "elitebook", genRank: 12 })).toBe(false);
    expect(isHomeRecentCandidate({ grade: "A", seriesValue: "aspire", genRank: 13 })).toBe(false);
    expect(isHomeRecentCandidate({ grade: "A", seriesValue: "latitude", genRank: 7 })).toBe(false);
    expect(isHomeRecentCandidate({ grade: "NEW", seriesValue: "zbook", genRank: null })).toBe(false);
  });
});

/**
 * Seisukorra klassid.
 *
 * TODO: REAL PROVIDER DATA REQUIRED
 * Klasside tähendus (`description`, `criteria`) PEAB tulema hulgilao dokumentatsioonist.
 * Praegused kirjeldused on arenduse ajutised näidistekstid ja on märgitud `isPlaceholder: true`.
 */
export const GRADE_CODES = ["A+", "A", "B", "C"] as const;
export type GradeCode = (typeof GRADE_CODES)[number];

export interface GradeInfo {
  code: GradeCode;
  /** URL-is kasutatav väärtus ("A+" ei sobi hästi URL-i) */
  param: string;
  label: string;
  description: string;
  criteria: string[];
  isPlaceholder: boolean;
}

export const GRADES: Record<GradeCode, GradeInfo> = {
  "A+": {
    code: "A+",
    param: "a-plus",
    label: "Nagu uus",
    description: "Näidistekst: kasutamise jälgi peaaegu ei ole.",
    criteria: ["Korpus: näidiskriteerium", "Ekraan: näidiskriteerium", "Klaviatuur: näidiskriteerium"],
    isPlaceholder: true,
  },
  A: {
    code: "A",
    param: "a",
    label: "Väga hea",
    description: "Näidistekst: väikesed kasutusjäljed, mis igapäevasel kasutamisel silma ei hakka.",
    criteria: ["Korpus: näidiskriteerium", "Ekraan: näidiskriteerium", "Klaviatuur: näidiskriteerium"],
    isPlaceholder: true,
  },
  B: {
    code: "B",
    param: "b",
    label: "Hea",
    description: "Näidistekst: nähtavad kasutusjäljed, seade on täielikult töökorras.",
    criteria: ["Korpus: näidiskriteerium", "Ekraan: näidiskriteerium", "Klaviatuur: näidiskriteerium"],
    isPlaceholder: true,
  },
  C: {
    code: "C",
    param: "c",
    label: "Rahuldav",
    description: "Näidistekst: selged kasutusjäljed, seade on täielikult töökorras.",
    criteria: ["Korpus: näidiskriteerium", "Ekraan: näidiskriteerium", "Klaviatuur: näidiskriteerium"],
    isPlaceholder: true,
  },
};

export function gradeFromParam(param: string): GradeCode | null {
  return GRADE_CODES.find((code) => GRADES[code].param === param) ?? null;
}

/**
 * Tarnijate erinevad kirjapildid → meie klass.
 * Tundmatu väärtus tagastab `null` — sellist toodet ei impordita enne, kui kaardistus on lisatud.
 */
export function parseSupplierGrade(raw: string): GradeCode | null {
  const normalized = raw
    .trim()
    .toUpperCase()
    .replace(/^(GRADE|CLASS|KLASS)\s*/, "")
    .replace(/\s*PLUS$/, "+")
    .replace(/\s+/g, "");
  return (GRADE_CODES as readonly string[]).includes(normalized) ? (normalized as GradeCode) : null;
}

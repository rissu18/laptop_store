/**
 * Seisukorra klassid.
 *
 * TODO: REAL PROVIDER DATA REQUIRED
 * Klasside tähendus (`description`, `criteria`) PEAB tulema hulgilao dokumentatsioonist.
 * Praegused kirjeldused on arenduse ajutised näidistekstid ja on märgitud `isPlaceholder: true`.
 *
 * "NEW" (kliendile "Uus") koondab tarnijate uue/uueväärse kauba klassid — Laptopid.ee: New, Demo, Outlet.
 * Tarnija algne klass säilib pakkumise juures (raw_data + details.sourceGrade), poes kuvatakse "Uus".
 */
export const GRADE_CODES = ["NEW", "A+", "A", "B", "C"] as const;
export type GradeCode = (typeof GRADE_CODES)[number];

export interface GradeInfo {
  code: GradeCode;
  /** URL-is kasutatav väärtus ("A+" ei sobi hästi URL-i) */
  param: string;
  label: string;
  /** Kas tähist ("A+") kuvatakse märgis sildi ees. "Uus" puhul on silt ise piisav. */
  showCode: boolean;
  description: string;
  criteria: string[];
  isPlaceholder: boolean;
}

export const GRADES: Record<GradeCode, GradeInfo> = {
  NEW: {
    code: "NEW",
    param: "uus",
    label: "Uus",
    showCode: false,
    // Ei väida, et seade on avamata tehasepakendis: klassi alla kuuluvad ka demo- ja outlet-seadmed
    description:
      "Uus või uueväärne seade, millel kasutusjälgi ei ole. Klassi alla võivad kuuluda ka demo- või outlet-seadmed (nt avatud pakendiga või näidisena olnud) — täpsem info on toote märkuses.",
    criteria: ["Kasutusjälgi ei ole", "Võib olla demo- või outlet-seade", "Pakend võib olla avatud"],
    isPlaceholder: false,
  },
  "A+": {
    code: "A+",
    param: "a-plus",
    label: "Nagu uus",
    showCode: true,
    description: "Näidistekst: kasutamise jälgi peaaegu ei ole.",
    criteria: ["Korpus: näidiskriteerium", "Ekraan: näidiskriteerium", "Klaviatuur: näidiskriteerium"],
    isPlaceholder: true,
  },
  A: {
    code: "A",
    param: "a",
    label: "Väga hea",
    showCode: true,
    description: "Näidistekst: väikesed kasutusjäljed, mis igapäevasel kasutamisel silma ei hakka.",
    criteria: ["Korpus: näidiskriteerium", "Ekraan: näidiskriteerium", "Klaviatuur: näidiskriteerium"],
    isPlaceholder: true,
  },
  B: {
    code: "B",
    param: "b",
    label: "Hea",
    showCode: true,
    description: "Näidistekst: nähtavad kasutusjäljed, seade on täielikult töökorras.",
    criteria: ["Korpus: näidiskriteerium", "Ekraan: näidiskriteerium", "Klaviatuur: näidiskriteerium"],
    isPlaceholder: true,
  },
  C: {
    code: "C",
    param: "c",
    label: "Rahuldav",
    showCode: true,
    description: "Näidistekst: selged kasutusjäljed, seade on täielikult töökorras.",
    criteria: ["Korpus: näidiskriteerium", "Ekraan: näidiskriteerium", "Klaviatuur: näidiskriteerium"],
    isPlaceholder: true,
  },
};

/** Kliendile kuvatav tekst: "A · Väga hea", "Uus" */
export function gradeDisplay(code: string): string {
  const info = GRADES[code as GradeCode];
  if (!info) return code;
  return info.showCode ? `${info.code} · ${info.label}` : info.label;
}

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

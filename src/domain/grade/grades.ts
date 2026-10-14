/**
 * Seisukorra klassid.
 *
 * Kirjeldused: Sülearvutid OÜ avaldatud klassimääratlus (laptopid.ee → "Sülearvutite Grade klassid", 14.10.2026).
 * C+ on ainult partnerlao (Foxway) klass — kirjeldatud konservatiivselt B ja C vahel.
 * Partnerlao seadmetele annab klassi tarnija oma hindamise järgi (vt /seisukorrad).
 *
 * "NEW" (kliendile "Uus") koondab tarnijate uue/uueväärse kauba klassid — Laptopid.ee: New, Demo, Outlet.
 * Tarnija algne klass säilib pakkumise juures (raw_data + details.sourceGrade), poes kuvatakse "Uus".
 */
/** Järjekord = parimast halvimani (filtri ja sorteerimise järjekord). C+ on eraldi klass (Foxway "Grade C+") — seda ei muudeta C-ks. */
export const GRADE_CODES = ["NEW", "A+", "A", "B", "C+", "C"] as const;
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
    description: "Välimuselt uueväärne — kasutusjälgi võib leida ainult põhjalikul uurimisel. Täielikult töökorras.",
    criteria: ["Korpus: võib esineda üksik peen kriimustus, peamiselt seadme alumisel küljel", "Ekraan: uueväärne, töötades nähtavate kahjustusteta"],
    isPlaceholder: false,
  },
  A: {
    code: "A",
    param: "a",
    label: "Väga hea",
    showCode: true,
    description: "Väga heas seisukorras, võib esineda vähest kasutusjälge. Täielikult töökorras.",
    criteria: ["Korpus: võib esineda kerget kulumist kaanel, põhja all või muudes nähtavates kohtades", "Ekraan: töökorras, töötades nähtavate kahjustusteta"],
    isPlaceholder: false,
  },
  B: {
    code: "B",
    param: "b",
    label: "Hea",
    showCode: true,
    description: "Heas seisukorras, võib esineda kulumisjälgi. Täielikult töökorras.",
    criteria: [
      "Korpus: kaanel või põhja all võivad olla väiksemad kriimustused, täkked või kleebiste eemaldamise jäljed; raam on terve, väga harva võib plastikdetailidel esineda üksikuid väikeseid mõrasid",
      "Ekraan: väljalülitatuna võivad olla nähtavad kerged klaviatuuri jäljed (sügavaid kriime ei ole); töötades neid näha pole, harva võivad esineda väikesed hämarad laigud",
    ],
    isPlaceholder: false,
  },
  "C+": {
    code: "C+",
    param: "c-plus",
    label: "Rahuldav+",
    showCode: true,
    // Ainult partnerlao (Foxway) klass "Grade C+": B- ja C-klassi vahel; konkreetse seadme märkus on tootelehel
    description: "Nähtavad kasutusjäljed, vähem kui C-klassil. Täielikult töökorras.",
    criteria: ["Korpus: võib esineda kriimustusi, täkkeid ja kleebiste eemaldamise jälgi", "Ekraan: töökorras; võimalikud jäljed on kirjas toote märkuses"],
    isPlaceholder: false,
  },
  C: {
    code: "C",
    param: "c",
    label: "Rahuldav",
    showCode: true,
    description: "Nähtavad kasutusjäljed. Täielikult töökorras.",
    criteria: [
      "Korpus: võib esineda kriimustusi, täkkeid, kleebiste eemaldamise jälgi ja väiksemaid pragusid, mis ei mõjuta toimimist; nurgad võivad olla kergelt painutatud, kui see ei takista kaane avamist ega sulgemist",
      "Ekraan: väljalülitatuna võivad olla märgatavad klaviatuuri jäljed ja kriimustused; töötades võib esineda surnud piksleid ja heledamaid laike",
    ],
    isPlaceholder: false,
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

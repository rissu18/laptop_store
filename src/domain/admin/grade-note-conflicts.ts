/**
 * Seisukorra klass vs pakkumise märkus (Andmekvaliteet → "Seisukord vs märkus"). Deterministlik märksõnakontroll
 * avaldatud klassimääratluse järgi (domain/grade/grades.ts). Ainult ülevaatus: tarnija andmeid ega klassi ei muudeta.
 *
 *  - Uus / A+: mis tahes kulumine, kriimustus, mõlk, mõra, puuduv tükk või ekraani laik on vastuolus
 *  - A: lubatud kerge kulumine; vastuolus on mõlk, mõra/pragu, puuduv tükk, katkine korpus ja ekraani kahjustus/laik
 *  - B: lubatud kriimud, täkked, väikesed mõrad ja hämarad laigud; vastuolus on mõlk, puuduv tükk, katkine korpus
 *  - C+ / C: kontrolli pole (klass lubab nähtavaid jälgi)
 * Liideste rike (nt "1 USB katki") EI mõjuta klassi (määratluse järgi) ja ei ole vastuolu.
 */

const RULES = {
  dent: { label: "mõlk", pattern: /m[õo]lk|\bdent/i },
  missingPiece: { label: "tükk puudu / katkine korpus", pattern: /t[üu]kk\w*\s+puudu|(korpus|kaas|kaane|nurk|nurgas?)\w*\s+(\w+\s+)?katki|purun/i },
  crack: { label: "mõra / pragu", pattern: /m[õo]ra|\bpragu|\bpraod|\bcrack/i },
  wear: { label: "kulumine / kriimustus", pattern: /kulun|kriim|\bt[äa]k(e|ked|kesid)\b|scratch|\bworn/i },
  screen: { label: "ekraani laik / kahjustus", pattern: /lai[kg]|(ekraan|klaas)\w*[^.]*(kriim|m[õo]ra|katki|piksel)/i },
} as const;
type RuleKey = keyof typeof RULES;

const CHECKS_BY_GRADE: Record<string, RuleKey[]> = {
  NEW: ["dent", "missingPiece", "crack", "wear", "screen"],
  "A+": ["dent", "missingPiece", "crack", "wear", "screen"],
  A: ["dent", "missingPiece", "crack", "screen"],
  B: ["dent", "missingPiece"],
};

/** Klassiga vastuolus olevad märkuse leiud (nt ["mõlk"]); tühi = vastuolu pole. */
export function gradeNoteConflicts(grade: string | null, notes: string[]): string[] {
  const checks = grade ? CHECKS_BY_GRADE[grade] : undefined;
  if (!checks) return [];
  const text = notes.filter(Boolean).join(" \n ");
  if (!text.trim()) return [];
  return checks.filter((key) => RULES[key].pattern.test(text)).map((key) => RULES[key].label);
}

/** Kliendile nähtavad märkused: tarnija märkus (Laptopid.ee defects) + Foxway seisukorra märkused (details.conditionNotices). */
export function customerConditionNotes(listing: { conditionNotes: string | null; details: unknown }): string[] {
  const notices = (listing.details as { conditionNotices?: { text?: string }[] } | null)?.conditionNotices ?? [];
  return [listing.conditionNotes ?? "", ...notices.map((n) => n.text ?? "")].filter((t) => t.trim());
}

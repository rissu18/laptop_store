/**
 * Foxway rikete ja seisukorra ohutusklassifikaator — ÜKS koht kogu koodis (vt docs/FOXWAY_SYNC.md → Rikked).
 *
 * Põhimõte: katkiseid arvuteid ei müüda. Tundmatu rike EI OLE ohutu (default closed).
 *
 *   INFO   — võib müüki minna; kliendile rahulik märkus tootelehel (nt kleepsujälg)
 *   NOTICE — võib müüki minna; kliendile nähtav märkus tootelehel ja kaardil (nt nõrgad LCD laigud)
 *   REVIEW — ei avaldata automaatselt; admin vaatab üle (ebamäärane või tundmatu rike, Working* ilma rikketa)
 *   BLOCK  — ei müüda (katkine/puuduv riistvara: ekraan, kaamera, kõlar, port, korpus …)
 *
 * Kontrollitakse ALATI mõlemat: "PC Fault Descriptions" ja "PC Additional Fault" — ka siis, kui Functionality on
 * "Working" (mitte ainult "Working*"). Kui kasvõi üks on BLOCK, ei lähe kogu SKU poodi. Toorväärtus säilib alati.
 */

export type FaultSeverity = "INFO" | "NOTICE" | "REVIEW" | "BLOCK";
export const FAULT_SEVERITY_RANK: Record<FaultSeverity, number> = { INFO: 0, NOTICE: 1, REVIEW: 2, BLOCK: 3 };

export const FAULT_SEVERITY_LABELS: Record<FaultSeverity, string> = {
  INFO: "Info (müüki)",
  NOTICE: "Märkus kliendile (müüki)",
  REVIEW: "Ülevaatus (poes ei kuvata)",
  BLOCK: "Blokeeritud (ei müüda)",
};

/** Kliendile nähtav märkus (eesti keeles, rahulik — mitte hirmutav) */
export interface PublicConditionNote {
  severity: "INFO" | "NOTICE";
  /** Pikk tekst tootelehele seisukorra juurde */
  text: string;
  /** Lühike tekst tootekaardile ("Seisukorra märkus: …") — ainult NOTICE puhul kuvatakse kaardil */
  short: string;
}

const NOTE_COSMETIC: PublicConditionNote = { severity: "INFO", text: "Võib esineda väikeseid kosmeetilisi kasutusjälgi.", short: "väikesed kosmeetilised kasutusjäljed" };
// "Scratched on Purpose" EI tähenda kliendile "tahtlikult kriimustatud" — see on eemaldatud kleepsu kerge jälg (sageli põhja all)
const NOTE_STICKER_MARK: PublicConditionNote = { severity: "INFO", text: "Korpusel võib olla kleepsu eemaldamisest jäänud kerge jälg.", short: "korpusel võib olla kerge kleepsujälg" };
const NOTE_STICKER_TINT: PublicConditionNote = { severity: "INFO", text: "Korpusel võib olla varasemast kleepsust jäänud kerge värvitooni erinevus.", short: "korpusel võib olla kerge värvitooni erinevus" };
const NOTE_LCD: PublicConditionNote = {
  severity: "NOTICE",
  text: "Ekraanil võivad esineda nõrgad laigud või kasutusjäljed. Need on üldjuhul vähesed ega sega tavakasutust.",
  short: "ekraanil võivad esineda nõrgad laigud",
};

interface FaultRule {
  severity: FaultSeverity;
  /** Adminile: miks see klass */
  reason: string;
  note?: PublicConditionNote;
}

/**
 * Teadaolevad Foxway rikketekstid (normaliseeritud: väiketähed, tühikud ühtlustatud). Päris feedis 2026-10-12 oli
 * 24 + 8 erinevat väärtust — kõik on siin. Uus tekst → REVIEW (vt classifyFault).
 */
const FAULT_RULES: Record<string, FaultRule> = {
  // INFO — kosmeetika
  "minor cosmetic fault": { severity: "INFO", reason: "Väike kosmeetiline jälg", note: NOTE_COSMETIC },
  "scratched on purpose": { severity: "INFO", reason: "Eemaldatud kleepsu jälg (mitte kriimustus)", note: NOTE_STICKER_MARK },
  "discoloration by sticker": { severity: "INFO", reason: "Kleepsu jäetud värvitooni erinevus korpusel", note: NOTE_STICKER_TINT },
  // NOTICE — nõrgad LCD laigud/jäljed (tavakasutuses vaevu märgatavad)
  "minor lcd fault": { severity: "NOTICE", reason: "Nõrgad LCD laigud/jäljed", note: NOTE_LCD },
  "minor lcd fault (spots)": { severity: "NOTICE", reason: "Nõrgad LCD laigud", note: NOTE_LCD },
  "minor lcd fault (wearmarks)": { severity: "NOTICE", reason: "Nõrgad LCD kasutusjäljed", note: NOTE_LCD },
  // REVIEW — liiga ebamäärane automaatseks müügiks
  "minor functional issues": { severity: "REVIEW", reason: "Ebamäärane funktsionaalne probleem — vajab ülevaatust" },
  "minor cosmetic fault (loose parts)": { severity: "REVIEW", reason: "Lahtised osad — vajab ülevaatust" },
  "minor lcd fault (discoloration)": { severity: "REVIEW", reason: "Ekraani värvitooni viga — ulatus teadmata, vajab ülevaatust" },
  "sim tray missing": { severity: "REVIEW", reason: "SIM-salv puudub — vajab ülevaatust" },
  // BLOCK — ekraan ja korpus
  "severe lcd damage": { severity: "BLOCK", reason: "Ekraan tõsiselt kahjustatud" },
  "cracked display glass": { severity: "BLOCK", reason: "Ekraani klaas mõranenud" },
  "black screen/dull screen": { severity: "BLOCK", reason: "Must/tuhm ekraan" },
  "damaged housing": { severity: "BLOCK", reason: "Korpus kahjustatud" },
  "loose hinge": { severity: "BLOCK", reason: "Lahtine hing" },
  // BLOCK — konkreetne riistvara ei tööta
  "faulty speaker": { severity: "BLOCK", reason: "Kõlar rikkis" },
  "speaker issue": { severity: "BLOCK", reason: "Kõlari rike" },
  "faulty camera": { severity: "BLOCK", reason: "Kaamera rikkis" },
  "cam issue": { severity: "BLOCK", reason: "Kaamera rike" },
  "faulty port (usb)": { severity: "BLOCK", reason: "USB-port rikkis" },
  "port not working (usb)": { severity: "BLOCK", reason: "USB-port ei tööta" },
  "faulty port": { severity: "BLOCK", reason: "Port rikkis" },
  "broken charging socket": { severity: "BLOCK", reason: "Laadimispesa katki" },
  "faulty touchscreen": { severity: "BLOCK", reason: "Puuteekraan rikkis" },
  "missing/broken pointer nub": { severity: "BLOCK", reason: "TrackPointi nupp puudub/katki" },
};

/** Tundmatu teksti tuntud rikke-sõnad → vähemalt BLOCK (nt tulevane "Faulty keyboard"); muu tundmatu → REVIEW */
const BLOCK_WORDS = /\b(faulty|broken|cracked|damaged?|severe|not working|dead|missing|defect(ive)?|no power|black screen)\b/i;

export interface FaultAssessment {
  /** Foxway algne tekst */
  raw: string;
  /** Kas tekst on klassifikaatorile teada (tundmatu → REVIEW/BLOCK + logi) */
  known: boolean;
  severity: FaultSeverity;
  reason: string;
  note: PublicConditionNote | null;
}

export function normalizeFaultText(raw: string): string {
  return raw.replace(/\s+/g, " ").trim().toLowerCase();
}

export function classifyFault(raw: string): FaultAssessment {
  const rule = FAULT_RULES[normalizeFaultText(raw)];
  if (rule) return { raw, known: true, severity: rule.severity, reason: rule.reason, note: rule.note ?? null };
  // Tundmatu rike ei ole kunagi "ohutu": selge rikke-sõna → BLOCK, muu → REVIEW
  return BLOCK_WORDS.test(raw)
    ? { raw, known: false, severity: "BLOCK", reason: "Tundmatu rikketekst rikke-sõnaga", note: null }
    : { raw, known: false, severity: "REVIEW", reason: "Tundmatu rikketekst — vajab ülevaatust", note: null };
}

export type FunctionalityKind = "WORKING" | "WORKING_WITH_FAULT" | "BROKEN" | "UNKNOWN" | "MISSING";

export function parseFunctionality(raw: string | null): FunctionalityKind {
  if (!raw) return "MISSING";
  const text = raw.trim().toLowerCase();
  if (text === "working") return "WORKING";
  if (text === "working*") return "WORKING_WITH_FAULT";
  if (/not\s*working|faulty|broken|dead|defect|for parts|scrap|incomplete/.test(text)) return "BROKEN";
  return "UNKNOWN";
}

export interface ConditionAssessment {
  /** Halvim tulemus kõigist kontrollidest; null = rikkeid pole, puhas */
  severity: FaultSeverity | null;
  faults: FaultAssessment[];
  /** Kliendile kuvatavad märkused (INFO/NOTICE), duplikaadid eemaldatud */
  notes: PublicConditionNote[];
  /** Adminile: miks REVIEW/BLOCK */
  reasons: string[];
  functionality: FunctionalityKind;
}

/**
 * Funktsionaalsus + mõlemad rikkeväljad → üks otsus.
 *   - Working* ilma ühegi rikketa → REVIEW (Foxway ütleb, et midagi on, aga mitte mida)
 *   - BROKEN / tundmatu Functionality → BLOCK / REVIEW
 *   - Iga rike klassifitseeritakse alati (ka "Working" real)
 */
export function assessCondition(input: { functionality: string | null; primaryFault: string | null; additionalFault: string | null }): ConditionAssessment {
  const functionality = parseFunctionality(input.functionality);
  const faults = [input.primaryFault, input.additionalFault].filter((f): f is string => Boolean(f?.trim())).map(classifyFault);
  const reasons: string[] = [];
  let severity: FaultSeverity | null = null;
  const raise = (next: FaultSeverity, reason: string) => {
    if (severity === null || FAULT_SEVERITY_RANK[next] > FAULT_SEVERITY_RANK[severity]) severity = next;
    if (next === "REVIEW" || next === "BLOCK") reasons.push(reason);
  };

  for (const fault of faults) raise(fault.severity, `Rike "${fault.raw}": ${fault.reason} (${fault.severity}${fault.known ? "" : ", TUNDMATU"})`);
  if (functionality === "WORKING_WITH_FAULT" && faults.length === 0) raise("REVIEW", 'Functionality "Working*" ilma rikke kirjelduseta');
  if (functionality === "BROKEN") raise("BLOCK", `Functionality "${input.functionality}" — ei tööta`);
  if (functionality === "UNKNOWN") raise("REVIEW", `Tundmatu Functionality "${input.functionality}"`);
  if (functionality === "MISSING") raise("REVIEW", "Functionality puudub");

  const notes: PublicConditionNote[] = [];
  for (const fault of faults) if (fault.note && !notes.some((n) => n.text === fault.note!.text)) notes.push(fault.note);
  // NOTICE enne INFO-t (olulisem kliendile)
  notes.sort((a, b) => FAULT_SEVERITY_RANK[b.severity] - FAULT_SEVERITY_RANK[a.severity]);
  return { severity, faults, notes, reasons, functionality };
}

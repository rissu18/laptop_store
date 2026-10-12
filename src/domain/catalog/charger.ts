import { powerClass, type PowerClassInput } from "./power-class";

/**
 * Laadija lisatasu — ÜKS koht (vt docs/FOXWAY_SYNC.md → Laadija). Klient saab ALATI sobiva laadija: kui tarnija hinnas
 * laadijat pole (Foxway "Unboxed"), lisame laadija ise ja selle kulu müügihinda.
 *
 *   Original Box      → originaalkarp + laadija            → 0 €
 *   Charger included  → laadija kaasas                      → 0 €
 *   Unboxed           → laadijat pole; lisame               → tavaline 35 € / suure võimsusega (tööjaam, RTX …) 90 €
 *
 * Profiilid on siin, et neid saaks hiljem täpsustada (nt Apple'i laadijad, 140 W USB-C) ühest kohast.
 */
export const CHARGER_PROFILES = {
  /** Laadija on tarnija hinnas */
  INCLUDED: { surchargeCents: 0, label: "Laadija tarnija hinnas" },
  /** Tavaline USB-C 65 W / tavaklassi sülearvuti laadija */
  STANDARD: { surchargeCents: 3_500, label: "Tavaline laadija (nt USB-C 65 W)" },
  /** Tööjaam / suure võimsusega masin */
  HIGH_POWER: { surchargeCents: 9_000, label: "Suure võimsusega laadija (tööjaam / jõudlusgraafika)" },
} as const;
export type ChargerProfile = keyof typeof CHARGER_PROFILES;

export type BoxedKind = "ORIGINAL_BOX" | "CHARGER_INCLUDED" | "UNBOXED" | "UNKNOWN";

/** Foxway "Boxed" toorväärtus → tähendus. Tundmatu/puuduv → UNKNOWN (sync paneb ülevaatusele). */
export function parseBoxed(raw: string | null | undefined): BoxedKind {
  const text = raw?.replace(/\s+/g, " ").trim().toLowerCase() ?? "";
  if (text === "original box") return "ORIGINAL_BOX";
  if (text === "charger included") return "CHARGER_INCLUDED";
  if (text === "unboxed") return "UNBOXED";
  return "UNKNOWN";
}

export interface ChargerDecision {
  boxed: BoxedKind;
  profile: ChargerProfile;
  surchargeCents: number;
  /** Adminile: miks 0 / 35 / 90 € */
  reason: string;
  /** Kliendile: kõigil juhtudel on laadija kaasas (vajadusel lisame ise) */
  customerLabel: string;
  /** Originaalkarp kaasas */
  originalBox: boolean;
}

export function chargerDecision(boxedRaw: string | null | undefined, machine: PowerClassInput): ChargerDecision {
  const boxed = parseBoxed(boxedRaw);
  if (boxed === "ORIGINAL_BOX") {
    return { boxed, profile: "INCLUDED", surchargeCents: 0, reason: "Original Box — originaalkarp ja laadija kaasas", customerLabel: "Originaalkarp ja laadija kaasas", originalBox: true };
  }
  if (boxed === "CHARGER_INCLUDED") {
    return { boxed, profile: "INCLUDED", surchargeCents: 0, reason: "Charger included — laadija kaasas", customerLabel: "Laadija kaasas", originalBox: false };
  }
  // Unboxed (või tundmatu → konservatiivselt sama: lisame laadija, et klient saaks alati laadija)
  const power = powerClass(machine);
  const profile: ChargerProfile = power.highPower ? "HIGH_POWER" : "STANDARD";
  const prefix = boxed === "UNBOXED" ? "Unboxed — laadijat tarnija hinnas pole" : `Tundmatu Boxed väärtus "${boxedRaw ?? "–"}" — eeldame, et laadijat pole`;
  return {
    boxed,
    profile,
    surchargeCents: CHARGER_PROFILES[profile].surchargeCents,
    reason: `${prefix}; ${CHARGER_PROFILES[profile].label}: ${power.reason}`,
    customerLabel: "Laadija kaasas",
    originalBox: false,
  };
}

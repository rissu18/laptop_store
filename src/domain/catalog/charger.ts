import { powerClass, type PowerClassInput } from "./power-class";

/**
 * Laadija lisatasu — ÜKS koht (vt docs/FOXWAY_SYNC.md → Laadija). Klient saab ALATI sobiva laadija: kui tarnija hinnas
 * laadijat pole (Foxway "Unboxed"), lisame laadija ise ja selle kulu müügihinda.
 *
 *   Original Box      → originaalkarp + laadija            → 0 €
 *   Charger included  → laadija kaasas                      → 0 €
 *   Unboxed           → laadijat pole; lisame               → tavaline 35 € / suure võimsusega (tööjaam, RTX …) 90 €
 *                                                             Apple: MacBook / Air / Pro 13" 35 €, Pro 14" 60 €,
 *                                                             Pro 15"/16" 90 €, Pro tundmatu suurus 90 € (ei alahinnata)
 *
 * Apple'i profiil ja üldine võimsusklass (power-class.ts) arvutatakse mõlemad; kehtib suurem summa.
 */
export const CHARGER_PROFILES = {
  /** Laadija on tarnija hinnas */
  INCLUDED: { surchargeCents: 0, label: "Laadija tarnija hinnas" },
  /** Tavaline USB-C 65 W / tavaklassi sülearvuti laadija */
  STANDARD: { surchargeCents: 3_500, label: "Tavaline laadija (nt USB-C 65 W)" },
  /** Keskmise võimsusega USB-C laadija (nt MacBook Pro 14" 70–96 W) */
  MID_POWER: { surchargeCents: 6_000, label: "Keskmise võimsusega laadija (nt USB-C 70–96 W)" },
  /** Tööjaam / suure võimsusega masin (nt MacBook Pro 16" 140 W) */
  HIGH_POWER: { surchargeCents: 9_000, label: "Suure võimsusega laadija (tööjaam / jõudlusgraafika / MacBook Pro 15–16\")" },
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
  /** Adminile: miks 0 / 35 / 60 / 90 € */
  reason: string;
  /** Kliendile: kõigil juhtudel on laadija kaasas (vajadusel lisame ise) */
  customerLabel: string;
  /** Originaalkarp kaasas */
  originalBox: boolean;
}

/** Laadija masina kirjeldus: võimsusklassi sisend + ekraani suurus (Apple'i profiili jaoks, kui mudelinimes pole) */
export type ChargerMachine = PowerClassInput & { screenSizeIn?: number | null };

/**
 * Apple'i sülearvuti laadija profiil seeria + ekraani suuruse järgi (mudelinimest `13"` või ekraani väljast).
 * Mitte-Apple → null. Ainult CPU järgi ei otsustata.
 */
export function appleChargerProfile(machine: ChargerMachine): { profile: ChargerProfile; reason: string } | null {
  if (machine.brand !== "apple") return null;
  const name = `${machine.series} ${machine.model}`;
  if (!/\bmacbook\b/i.test(name)) return null;
  if (!/\bpro\b/i.test(machine.series) && !/\bmacbook\s+pro\b/i.test(name)) return { profile: "STANDARD", reason: "Apple MacBook / MacBook Air — USB-C 30–70 W" };
  const fromName = name.match(/\b(1[2-7])(?:[.,]\d)?\s*(?:"|''|”|″|-inch|\s*tolli)/i)?.[1];
  const size = fromName ? Number(fromName) : machine.screenSizeIn ? Math.round(machine.screenSizeIn) : null;
  if (size !== null && size <= 13) return { profile: "STANDARD", reason: `Apple MacBook Pro ${size}" — USB-C 61–67 W` };
  if (size === 14) return { profile: "MID_POWER", reason: 'Apple MacBook Pro 14" — USB-C 70–96 W' };
  if (size !== null && size >= 15) return { profile: "HIGH_POWER", reason: `Apple MacBook Pro ${size}" — 87–140 W` };
  return { profile: "HIGH_POWER", reason: "Apple MacBook Pro, suurus teadmata — konservatiivselt suure võimsusega laadija (ei alahinnata)" };
}

export function chargerDecision(boxedRaw: string | null | undefined, machine: ChargerMachine): ChargerDecision {
  const boxed = parseBoxed(boxedRaw);
  if (boxed === "ORIGINAL_BOX") {
    return { boxed, profile: "INCLUDED", surchargeCents: 0, reason: "Original Box — originaalkarp ja laadija kaasas", customerLabel: "Originaalkarp ja laadija kaasas", originalBox: true };
  }
  if (boxed === "CHARGER_INCLUDED") {
    return { boxed, profile: "INCLUDED", surchargeCents: 0, reason: "Charger included — laadija kaasas", customerLabel: "Laadija kaasas", originalBox: false };
  }
  // Unboxed (või tundmatu → konservatiivselt sama: lisame laadija, et klient saaks alati laadija)
  const power = powerClass(machine);
  const general: { profile: ChargerProfile; reason: string } = power.highPower ? { profile: "HIGH_POWER", reason: power.reason } : { profile: "STANDARD", reason: power.reason };
  const apple = appleChargerProfile(machine);
  // Suurem summa kehtib (nt MacBook Pro 15" Radeon Pro → 90 € mõlemast)
  const chosen = apple && CHARGER_PROFILES[apple.profile].surchargeCents >= CHARGER_PROFILES[general.profile].surchargeCents ? apple : general;
  const prefix = boxed === "UNBOXED" ? "Unboxed — laadijat tarnija hinnas pole" : `Tundmatu Boxed väärtus "${boxedRaw ?? "–"}" — eeldame, et laadijat pole`;
  return {
    boxed,
    profile: chosen.profile,
    surchargeCents: CHARGER_PROFILES[chosen.profile].surchargeCents,
    reason: `${prefix}; ${CHARGER_PROFILES[chosen.profile].label}: ${chosen.reason}`,
    customerLabel: "Laadija kaasas",
    originalBox: false,
  };
}

/**
 * Sülearvuti "võimsusklass": mobiilne tööjaam / suure võimsusega masin vs tavaline äriklass.
 * Üks koht — kasutavad sarnaste toodete järjestus (similar.ts) ja laadija lisatasu (charger.ts).
 *
 * Ei klassifitseerita AINULT protsessori nime järgi (H-seeria CPU ei tähenda alati suurt laadijat).
 */

export interface PowerClassInput {
  brand: string;
  series: string;
  model: string;
  gpu?: string | null;
  gpuDedicated?: boolean | null;
}

/** Tootja tööjaama seeriad (mobiilsed tööjaamad) */
const WORKSTATION_SERIES: { brand: string; series: RegExp }[] = [
  { brand: "dell", series: /^Precision$/i },
  { brand: "hp", series: /^ZBook$/i },
  { brand: "lenovo", series: /^ThinkPad P$/i },
  { brand: "fujitsu", series: /^CELSIUS$/i },
];

export function isMobileWorkstation(input: Pick<PowerClassInput, "brand" | "series" | "model">): boolean {
  if (WORKSTATION_SERIES.some((w) => w.brand === input.brand && w.series.test(input.series.trim()))) return true;
  // Mudelinimes seeria (nt tundmatu seeria tagavara: "Celsius H780", "ZBook Fury 16 G9")
  return /\b(precision|zbook|celsius)\b/i.test(input.model) || (input.brand === "lenovo" && /^ThinkPad\s+P\d/i.test(`${input.series} ${input.model}`));
}

/** Eraldi jõudlusgraafika (GeForce RTX/GTX, Quadro/RTX A/Ada, Radeon Pro/RX) → suur laadija (mitte MX-seeria) */
const HIGH_POWER_GPU = /\b(rtx|gtx|quadro|radeon\s+pro|radeon\s+rx|rx\s?\d{4}m?|firepro)\b/i;

export function hasHighPowerGpu(input: Pick<PowerClassInput, "gpu" | "gpuDedicated">): boolean {
  return Boolean(input.gpu && input.gpuDedicated !== false && HIGH_POWER_GPU.test(input.gpu));
}

export type PowerClass = { highPower: boolean; reason: string };

/** Kas masin vajab suure võimsusega laadijat (tööjaam või jõudlusgraafika). Teadmata → tavaline. */
export function powerClass(input: PowerClassInput): PowerClass {
  if (isMobileWorkstation(input)) return { highPower: true, reason: "Mobiilne tööjaam (Precision / ZBook / ThinkPad P / Celsius)" };
  if (hasHighPowerGpu(input)) return { highPower: true, reason: `Jõudlusgraafika (${input.gpu})` };
  return { highPower: false, reason: "Tavaline sülearvuti (suure võimsuse vajadus pole teada)" };
}

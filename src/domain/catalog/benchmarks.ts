import { cpuGpuKey, type ListingEnrichment } from "./enrichment";
import type { ListingDetails } from "./listing-details";

/**
 * Protsessori ja graafika "kiirusindeks" (benchmark) ning protsessori maksimaalne sagedus.
 *
 * - Benchmark kirjeldab KOMPONENTI (3DMark06 CPU → protsessor, 3DMark11 GPU → graafika), mitte konkreetse sülearvuti
 *   seisukorda. Allikas: Laptopid.ee (`cpu_3dmark06`, `gpu_3dmark11`); maks. sagedus: Laptopid.ee CPU tekstist
 *   ("i5-8350U 3600Mhz" = maksimaalne turbo).
 * - Tarnija enda väärtus on `details` all (sync), teiste tarnijate pakkumistele kantakse see üle ainult TÄPSE CPU/GPU
 *   vastega (`supplier_listings.enrichment`, `npm run enrich:catalog`). Pood loeb ainult andmebaasi.
 * - Admini parandus võidab: kui admin muutis CPU-d või GPU-d, tarnija/rikastatud benchmarki ega sagedust ei kuvata
 *   (need kirjeldasid teist komponenti).
 * - Puuduv / 0 / vigane väärtus = NULL; ei leiutata ega kuvata "0".
 */

/** Benchmark: lõplik positiivne arv (number või numbriline tekst "6235", "6 235", "6235.5"). Muu → null. */
export function parseBenchmark(value: unknown): number | null {
  let n: number;
  if (typeof value === "number") n = value;
  else if (typeof value === "string" && /^\s*\d[\d\s]*(?:[.,]\d+)?\s*$/.test(value)) n = Number(value.replace(/\s+/g, "").replace(",", "."));
  else return null;
  if (!Number.isFinite(n) || n <= 0 || n > 1_000_000) return null;
  return Math.round(n * 100) / 100;
}

/** Protsessori maks. sagedus MHz-des: mõistlik vahemik 400–7000 MHz, muu → null */
export function validCpuMaxMhz(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) && value >= 400 && value <= 7000 ? Math.round(value) : null;
}

// ---- Täpsed võtmed (üle tarnijate) -----------------------------------------------------------------------------

/**
 * Täpne CPU võti: "Intel Core i5-8350U" → "i5-8350u", "AMD Ryzen 5 PRO 5650U" → "ryzen 5 pro 5650u".
 * Ainult konkreetse mudelinumbriga CPU (vähemalt 3 numbrit): "Intel Core i5", "AMD Ryzen 7" → null (ei piisa).
 * PRO ja mitte-PRO on eri võtmed (ei liideta).
 */
export function cpuBenchmarkKey(cpu: string | null | undefined): string | null {
  if (!cpu?.trim()) return null;
  const key = cpuGpuKey(cpu).replace(/\b\d+(?:[.,]\d+)?\s*(?:mhz|ghz)\b/g, "").replace(/\s+/g, " ").trim();
  return /\d{3}/.test(key) ? key : null;
}

/** Üldised graafikanimed, mille järgi benchmarki üle kanda ei tohi (eri protsessorites eri jõudlus) */
const GENERIC_GPU = /^(integrated|integreeritud graafika|intel( hd| uhd)?( graphics)?|amd radeon( pro)?( graphics)?|radeon( graphics)?|intel arc( graphics)?|apple gpu.*|nvidia|dedicated|discrete)$/;

/**
 * Täpne GPU võti: väiketähed, "NVIDIA" ja integreeritud kaaslane ("+ Intel", "+ HD Graphics 620") ning mälumaht
 * ("16GB") välja; "Quadro", "GeForce", "Laptop GPU" jäävad (Quadro RTX 3000 ≠ RTX 3000 Ada; RTX A2000 ≠ "RTX A2000
 * Laptop GPU", kuni pole kinnitatud). Üldine nimi ("Integrated", "Intel Graphics", "AMD Radeon Graphics") → null.
 * Iris Xe on lubatud (sama nimi ühe väärtusega).
 */
export function gpuBenchmarkKey(gpu: string | null | undefined): string | null {
  if (!gpu?.trim()) return null;
  const key = gpu
    .toLowerCase()
    .replace(/\((r|tm)\)|®|™/g, "")
    .replace(/\s*\+.*$/, "")
    .replace(/\b\d+\s*gb\b/g, "")
    .replace(/\bnvidia\b/g, "")
    .replace(/\s+/g, " ")
    .trim();
  if (!key || GENERIC_GPU.test(key)) return null;
  if (!/\d/.test(key) && !/\biris xe\b/.test(key)) return null;
  return key;
}

export interface BenchmarkSample {
  key: string;
  value: number;
  label: string;
}

export interface BenchmarkIndexEntry {
  value: number;
  samples: number;
  labels: string[];
}

/** Võti → üksmeelne väärtus. Sama võtme eri väärtused = konflikt (ei valita suvaliselt, aruandesse). */
export function buildBenchmarkIndex(samples: BenchmarkSample[]): { index: Map<string, BenchmarkIndexEntry>; conflicts: { key: string; values: number[]; labels: string[] }[] } {
  const groups = new Map<string, { values: Map<number, number>; labels: Set<string> }>();
  for (const s of samples) {
    const g = groups.get(s.key) ?? { values: new Map(), labels: new Set() };
    g.values.set(s.value, (g.values.get(s.value) ?? 0) + 1);
    g.labels.add(s.label);
    groups.set(s.key, g);
  }
  const index = new Map<string, BenchmarkIndexEntry>();
  const conflicts: { key: string; values: number[]; labels: string[] }[] = [];
  for (const [key, g] of groups) {
    if (g.values.size === 1) {
      const [[value, samples]] = [...g.values];
      index.set(key, { value, samples, labels: [...g.labels] });
    } else conflicts.push({ key, values: [...g.values.keys()].sort((a, b) => a - b), labels: [...g.labels] });
  }
  return { index, conflicts };
}

// ---- Efektiivne väärtus (pood) ---------------------------------------------------------------------------------

export interface Performance {
  cpuMaxGhz: number | null;
  cpuBenchmark: number | null;
  gpuBenchmark: number | null;
}

/**
 * Pakkumise jõudlusväärtused: tarnija oma (`details`) → täpse vastega rikastus (`enrichment`). Kui admin parandas
 * CPU/GPU (`manual_overrides.cpu` / `.gpu`), selle komponendi väärtusi ei kuvata.
 */
export function effectivePerformance(listing: {
  details?: ListingDetails | null;
  enrichment?: ListingEnrichment | null;
  manualOverrides?: Record<string, unknown> | null;
}): Performance {
  const d = listing.details ?? {};
  const e = listing.enrichment ?? {};
  const overrides = listing.manualOverrides ?? {};
  const cpuOverridden = "cpu" in overrides;
  const gpuOverridden = "gpu" in overrides;
  const mhz = cpuOverridden ? null : (validCpuMaxMhz(d.cpuMaxMhz) ?? validCpuMaxMhz(e.cpuMaxMhz?.value));
  return {
    cpuMaxGhz: mhz === null ? null : mhz / 1000,
    cpuBenchmark: cpuOverridden ? null : (parseBenchmark(d.cpuBenchmark3dmark06) ?? parseBenchmark(e.cpuBenchmark?.value)),
    gpuBenchmark: gpuOverridden ? null : (parseBenchmark(d.gpuBenchmark3dmark11) ?? parseBenchmark(e.gpuBenchmark?.value)),
  };
}

// ---- Kuvamine (eesti keel) --------------------------------------------------------------------------------------

/** 4.7 → "4,70 GHz" */
export function formatGhz(ghz: number): string {
  return `${new Intl.NumberFormat("et-EE", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(ghz)} GHz`;
}

/** 6235 → "6 235" (tuhandete eraldaja ka 4-kohalistel; et-EE vaikimisi ei eralda) */
export function formatBenchmark(value: number): string {
  return new Intl.NumberFormat("et-EE", { maximumFractionDigits: 0, useGrouping: "always" } as Intl.NumberFormatOptions).format(value);
}

export const BENCHMARK_INFO = {
  cpu: "Benchmark: 3DMark06 CPU. Suurem tulemus tähendab suuremat protsessori jõudlust.",
  gpu: "Benchmark: 3DMark11 GPU. Suurem tulemus tähendab suuremat graafikajõudlust.",
  note: "CPU ja GPU kiirusindekseid omavahel võrrelda ei saa.",
} as const;

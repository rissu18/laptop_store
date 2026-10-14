import { cpuBenchmarkKey, gpuBenchmarkKey, parseBenchmark, validCpuMaxMhz } from "@/domain/catalog/benchmarks";

/**
 * Andmekvaliteet → "Kahtlased jõudlusandmed": deterministlikud kontrollid (mitte AI). Ainult ülevaatuse järjekord —
 * väärtusi automaatselt üle ei kirjutata; admin parandab konfiguratsiooni lehel (jõudluse parandus).
 *
 *  - MHZ_INVALID: maks. sagedus on olemas, aga väljaspool 400–7000 MHz (või mitte arv)
 *  - BENCHMARK_INVALID: kiirusindeks on olemas, aga ≤ 0 / mitte arv / üle 1 000 000
 *  - CPU_BENCHMARK_CONFLICT / CPU_MHZ_CONFLICT: sama täpne CPU (cpuBenchmarkKey), tarnija annab eri väärtused
 *  - GPU_BENCHMARK_CONFLICT: sama täpne GPU (gpuBenchmarkKey), eri väärtused
 *  - INTEGRATED_GPU_CONFLICT: sama täpne CPU, aga integreeritud GPU nimi erineb (nt i5-8350U: HD 520 vs UHD 620)
 */

export const ANOMALY_LABELS = {
  MHZ_INVALID: "Maks. sagedus väljaspool 400–7000 MHz",
  BENCHMARK_INVALID: "Kiirusindeks ≤ 0 või vigane",
  CPU_BENCHMARK_CONFLICT: "Sama CPU, erinev CPU kiirusindeks",
  CPU_MHZ_CONFLICT: "Sama CPU, erinev maks. sagedus",
  GPU_BENCHMARK_CONFLICT: "Sama GPU, erinev GPU kiirusindeks",
  INTEGRATED_GPU_CONFLICT: "Sama CPU, erinev integreeritud GPU",
} as const;
export type AnomalyKind = keyof typeof ANOMALY_LABELS;

export interface AnomalyInput {
  id: string;
  sku: string;
  /** Efektiivne CPU / GPU (parandus ?? tarnija ?? rikastus) */
  cpu: string | null;
  gpu: string | null;
  gpuDedicated: boolean | null;
  details: unknown;
  enrichment: unknown;
  manualOverrides: unknown;
}

export interface Anomaly {
  kind: AnomalyKind;
  /** CPU/GPU võti (konflikt) või SKU (üksik vigane väärtus) */
  key: string;
  values: { value: string; listings: { id: string; sku: string }[] }[];
}

const present = (value: unknown) => value !== null && value !== undefined && value !== "";
const record = (value: unknown) => (value && typeof value === "object" ? (value as Record<string, unknown>) : {});
const enrichedValue = (enrichment: Record<string, unknown>, key: string) => record(enrichment[key]).value;

/** Integreeritud GPU võrdlusnimi: kirjapildi erinevused ("Iris Xe Graphics" = "Iris Xe") ei ole konflikt. */
export function integratedGpuName(gpu: string | null): string | null {
  const key = gpuBenchmarkKey(gpu);
  return key ? key.replace(/\bgraphics\b/g, "").replace(/\s+/g, " ").trim() : null;
}

export function findPerformanceAnomalies(rows: AnomalyInput[]): Anomaly[] {
  const anomalies: Anomaly[] = [];
  const single = (kind: AnomalyKind, row: AnomalyInput, value: unknown) => anomalies.push({ kind, key: row.sku, values: [{ value: String(value), listings: [{ id: row.id, sku: row.sku }] }] });
  const groups = new Map<string, Map<string, { id: string; sku: string }[]>>();
  const addToGroup = (kind: AnomalyKind, key: string | null, value: string | null, row: AnomalyInput) => {
    if (!key || value === null) return;
    const groupKey = `${kind}|${key}`;
    const byValue = groups.get(groupKey) ?? new Map<string, { id: string; sku: string }[]>();
    byValue.set(value, [...(byValue.get(value) ?? []), { id: row.id, sku: row.sku }]);
    groups.set(groupKey, byValue);
  };

  for (const row of rows) {
    const details = record(row.details);
    const enrichment = record(row.enrichment);
    const overrides = record(row.manualOverrides);
    // Üksikud vigased väärtused (tarnija, rikastus või admini parandus)
    for (const value of [details.cpuMaxMhz, enrichedValue(enrichment, "cpuMaxMhz"), overrides.cpuMaxMhz]) {
      if (present(value) && validCpuMaxMhz(value) === null) {
        single("MHZ_INVALID", row, value);
        break;
      }
    }
    for (const value of [details.cpuBenchmark3dmark06, details.gpuBenchmark3dmark11, enrichedValue(enrichment, "cpuBenchmark"), enrichedValue(enrichment, "gpuBenchmark"), overrides.cpuBenchmark, overrides.gpuBenchmark]) {
      if (present(value) && parseBenchmark(value) === null) {
        single("BENCHMARK_INVALID", row, value);
        break;
      }
    }
    // Konfliktid: ainult tarnija enda väärtused (rikastus kopeerib neid — see ei ole sõltumatu allikas)
    const cpuKey = cpuBenchmarkKey(row.cpu);
    const cpuBench = parseBenchmark(details.cpuBenchmark3dmark06);
    const mhz = validCpuMaxMhz(details.cpuMaxMhz);
    addToGroup("CPU_BENCHMARK_CONFLICT", cpuKey, cpuBench === null ? null : String(cpuBench), row);
    addToGroup("CPU_MHZ_CONFLICT", cpuKey, mhz === null ? null : String(mhz), row);
    const gpuBench = parseBenchmark(details.gpuBenchmark3dmark11);
    addToGroup("GPU_BENCHMARK_CONFLICT", gpuBenchmarkKey(row.gpu), gpuBench === null ? null : String(gpuBench), row);
    if (row.gpuDedicated === false) addToGroup("INTEGRATED_GPU_CONFLICT", cpuKey, integratedGpuName(row.gpu), row);
  }

  for (const [groupKey, byValue] of groups) {
    if (byValue.size < 2) continue;
    const [kind, key] = groupKey.split("|") as [AnomalyKind, string];
    anomalies.push({ kind, key, values: [...byValue].map(([value, listings]) => ({ value, listings })).sort((a, b) => b.listings.length - a.listings.length) });
  }
  return anomalies.sort((a, b) => a.kind.localeCompare(b.kind) || a.key.localeCompare(b.key));
}

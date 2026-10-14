import { cpuBenchmarkKey, effectivePerformance, gpuBenchmarkKey, PERFORMANCE_OVERRIDE_FIELDS, type PerformanceOverrideField } from "@/domain/catalog/benchmarks";
import { applyListingEnrichment, type ListingEnrichment } from "@/domain/catalog/enrichment";
import type { ListingDetails } from "@/domain/catalog/listing-details";
import { applyOverrides, hasOverride, listingOverridableFields } from "@/domain/catalog/overrides";

/**
 * Admin → konfiguratsioon → "Väljade päritolu": iga olulise välja tarnija väärtus, rikastus, admini parandus ja
 * KEHTIV väärtus (see, mida pood näitab). Kehtiv arvutatakse samade funktsioonidega mis poes
 * (applyOverrides → applyListingEnrichment, effectivePerformance) — siin ei ole paralleelset reeglit.
 *
 * Prioriteet: admini parandus > tarnija > rikastus (rikastus täidab ainult tühja tarnija välja).
 */

export type ProvenanceSource = "manual" | "supplier" | "enrichment" | "model" | null;

export interface ProvenanceRow {
  field: string;
  label: string;
  supplier: unknown;
  /** Rikastuse väärtus + vaste alus (nt "cpu:i5-1135g7 (12 pakkumist)") */
  enrichment: { value: unknown; matchedBy?: string; source?: string } | null;
  /** undefined = parandust pole; null = admin märkis väärtuse puuduvaks */
  manual: unknown;
  hasManual: boolean;
  effective: unknown;
  source: ProvenanceSource;
  /** Kas seda välja saab konfiguratsiooni lehel otse parandada (jõudlus) */
  overrideField?: PerformanceOverrideField;
  note?: string;
}

interface ListingInput {
  priceSource: string;
  manualOverrides: unknown;
  enrichment: unknown;
  details: unknown;
  gpu: string | null;
  gpuDedicated: boolean | null;
  resolution: string | null;
  resolutionLabel: string | null;
  [key: string]: unknown;
}

const COLUMN_FIELDS: [string, string][] = [
  ["cpu", "Protsessor"],
  ["gpu", "Graafika"],
  ["ramGb", "RAM (GB)"],
  ["storageGb", "SSD (GB)"],
  ["screenSizeIn", "Ekraan (tolli)"],
  ["resolution", "Resolutsioon"],
  ["keyboard", "Klaviatuur"],
];

const isEmpty = (value: unknown) => value === null || value === undefined || (typeof value === "string" && value.trim() === "");

export function listingProvenance(raw: ListingInput, model?: { screenSizeIn: number | null }): ProvenanceRow[] {
  const overrides = (raw.manualOverrides ?? {}) as Record<string, unknown>;
  const enrichment = (raw.enrichment ?? null) as ListingEnrichment | null;
  const details = (raw.details ?? {}) as ListingDetails;
  const effective: Record<string, unknown> = applyListingEnrichment(applyOverrides(raw, overrides, listingOverridableFields(raw.priceSource)), enrichment);

  const enrichedValue = (field: string): ProvenanceRow["enrichment"] => {
    if (field === "gpu" && enrichment?.gpu) return { value: enrichment.gpu.value, matchedBy: enrichment.gpu.matchedBy, source: enrichment.gpu.source };
    if (field === "resolution" && enrichment?.resolution) return { value: enrichment.resolution.value.resolution, matchedBy: enrichment.resolution.matchedBy, source: enrichment.resolution.source };
    return null;
  };

  const rows: ProvenanceRow[] = COLUMN_FIELDS.map(([field, label]) => {
    const hasManual = hasOverride(overrides, field);
    const supplier = raw[field] ?? null;
    let value = effective[field] ?? null;
    let source: ProvenanceSource = hasManual ? "manual" : !isEmpty(supplier) ? "supplier" : !isEmpty(value) ? "enrichment" : null;
    let note: string | undefined;
    // Ekraan: pood kasutab mudeli ekraani (kui olemas), pakkumise oma on varuväärtus
    if (field === "screenSizeIn" && model?.screenSizeIn) {
      value = model.screenSizeIn;
      source = "model";
      note = "Poes kuvatakse mudeli ekraani suurus.";
    }
    return { field, label, supplier, enrichment: enrichedValue(field), manual: hasManual ? overrides[field] : undefined, hasManual, effective: value, source, note };
  });

  // Jõudlus: admini parandus > tarnija (details) > täpse vastega rikastus; CPU/GPU nime parandus tühistab tarnija/rikastuse
  const performance = effectivePerformance({ details, enrichment, manualOverrides: overrides });
  const perf: [PerformanceOverrideField, string, unknown, ListingEnrichment[keyof ListingEnrichment] | undefined, number | null, "cpu" | "gpu"][] = [
    ["cpuMaxMhz", "CPU maks. sagedus (MHz)", details.cpuMaxMhz ?? null, enrichment?.cpuMaxMhz, performance.cpuMaxGhz === null ? null : Math.round(performance.cpuMaxGhz * 1000), "cpu"],
    ["cpuBenchmark", "CPU kiirusindeks (3DMark06)", details.cpuBenchmark3dmark06 ?? null, enrichment?.cpuBenchmark, performance.cpuBenchmark, "cpu"],
    ["gpuBenchmark", "GPU kiirusindeks (3DMark11)", details.gpuBenchmark3dmark11 ?? null, enrichment?.gpuBenchmark, performance.gpuBenchmark, "gpu"],
  ];
  for (const [field, label, supplier, enriched, value, component] of perf) {
    const hasManual = hasOverride(overrides, field);
    const componentOverridden = hasOverride(overrides, component);
    const enrichedRow = enriched && typeof enriched === "object" && "value" in enriched ? { value: enriched.value, matchedBy: enriched.matchedBy, source: enriched.source } : null;
    const source: ProvenanceSource = hasManual ? "manual" : value === null ? null : !isEmpty(supplier) && !componentOverridden && supplier !== null ? "supplier" : "enrichment";
    rows.push({
      field,
      label,
      supplier,
      enrichment: enrichedRow,
      manual: hasManual ? overrides[field] : undefined,
      hasManual,
      effective: value,
      source,
      overrideField: field,
      note: !hasManual && componentOverridden ? `Admin parandas ${component === "cpu" ? "protsessori" : "graafika"} nime — tarnija/rikastuse väärtust ei kasutata.` : undefined,
    });
  }
  return rows;
}

/** Kanoonilised CPU/GPU võtmed (täpne vaste üle tarnijate, benchmarks.ts) — kuvatakse jõudluse kaardil. */
export function performanceKeys(effective: { cpu: string | null; gpu: string | null }) {
  return { cpu: cpuBenchmarkKey(effective.cpu), gpu: gpuBenchmarkKey(effective.gpu) };
}

export { PERFORMANCE_OVERRIDE_FIELDS };

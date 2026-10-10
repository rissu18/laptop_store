/**
 * Tarnija väärtused vs admini parandused (manual override).
 *
 * Andmebaasis on iga tarnija välja jaoks tavaline veerg (= tarnija väärtus, sync kirjutab seda)
 * ja eraldi JSONB `manual_overrides` { väli: väärtus } (= admini parandus, sync ei puutu).
 *
 *   effectiveValue = field in manualOverrides ? manualOverrides[field] : supplierValue
 *
 * Nii ei kirjuta järgmine tarnija sync admini parandusi üle ja admin näeb alati mõlemat väärtust.
 * Admin saab parandust ka "tühistada" (välja eemaldamine overrides'ist → tagasi tarnija väärtusele).
 */

/** Pakkumise väljad, mida admin tohib üle kirjutada (tarnija kontrollitud väljad). */
export const LISTING_OVERRIDABLE_FIELDS = [
  "cpu",
  "cpuFamily",
  "cpuGeneration",
  "ramGb",
  "ramType",
  "storageGb",
  "gpu",
  "gpuDedicated",
  "screenSizeIn",
  "resolution",
  "resolutionLabel",
  "panel",
  "touchscreen",
  "keyboard",
  "grade",
  "stock",
  "supplierPriceCents",
  "operatingSystem",
  "warrantyMonths",
  "batteryHealthPct",
  "chargerIncluded",
] as const;
export type ListingOverridableField = (typeof LISTING_OVERRIDABLE_FIELDS)[number];

/** Mudeli väljad, mis tulevad tarnijast/normaliseerimisest, aga mida admin tohib parandada. */
export const MODEL_OVERRIDABLE_FIELDS = ["manufacturer", "family", "model", "generation", "screenSizeIn", "weightKg"] as const;
export type ModelOverridableField = (typeof MODEL_OVERRIDABLE_FIELDS)[number];

/**
 * Admini väljad (sync ei kirjuta neid kunagi): status, featured, description, müügihind,
 * mudeli seos (product_model_id), piltide järjekord/peitmine/põhipilt.
 */
export const ADMIN_OWNED_FIELDS = ["status", "featured", "description", "salePriceCents", "productModelId", "images"] as const;

export function hasOverride(overrides: Record<string, unknown> | null | undefined, field: string): boolean {
  return Boolean(overrides) && Object.prototype.hasOwnProperty.call(overrides, field);
}

/** Tagastab rea koopia, kus lubatud väljad on asendatud admini parandustega. */
export function applyOverrides<T extends Record<string, unknown>>(row: T, overrides: Record<string, unknown> | null | undefined, allowed: readonly string[]): T {
  if (!overrides) return row;
  const result: Record<string, unknown> = { ...row };
  for (const field of allowed) {
    if (hasOverride(overrides, field)) result[field] = overrides[field];
  }
  return result as T;
}

/**
 * Salvestab admini uued väärtused: kui väärtus võrdub tarnija väärtusega, eemaldatakse parandus
 * (pole mõtet hoida duplikaati); muidu salvestatakse parandusena.
 */
export function mergeOverrides(
  supplierRow: Record<string, unknown>,
  currentOverrides: Record<string, unknown>,
  changes: Record<string, unknown>,
  allowed: readonly string[],
): Record<string, unknown> {
  const next = { ...currentOverrides };
  for (const [field, value] of Object.entries(changes)) {
    if (!allowed.includes(field)) continue;
    if (Object.is(supplierRow[field] ?? null, value ?? null)) delete next[field];
    else next[field] = value;
  }
  return next;
}

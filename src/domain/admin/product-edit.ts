import { z } from "zod";
import { KEYBOARD_CODES } from "@/domain/catalog/keyboard";
import { BRAND_CODES, CPU_FAMILIES } from "@/domain/catalog/types";
import { GRADE_CODES } from "@/domain/grade/grades";

/**
 * Admini tootevormide valideerimine (kasutatakse serveris — kliendi valideerimist ei usaldata).
 * Tühi väli = "puudub" (null). Väärtusi ei asendata vaikeväärtustega.
 */

export const CATALOG_STATUS_VALUES = ["ACTIVE", "HIDDEN", "ARCHIVED"] as const;
/** = supplier_listings.quality_hold (schema.ts QUALITY_HOLDS) */
export const QUALITY_HOLD_VALUES = ["REVIEW", "BLOCKED"] as const;
export const STATUS_LABELS: Record<(typeof CATALOG_STATUS_VALUES)[number], string> = {
  ACTIVE: "Aktiivne (poes nähtav)",
  HIDDEN: "Peidetud (poes ei näidata)",
  ARCHIVED: "Arhiveeritud",
};

const emptyToNull = (value: unknown) => (typeof value === "string" && value.trim() === "" ? null : value);
const text = (max: number) => z.preprocess(emptyToNull, z.string().trim().max(max).nullable());
const requiredText = (max: number) => z.string().trim().min(1, "Kohustuslik väli").max(max);
const int = (min: number, max: number) =>
  z.preprocess(emptyToNull, z.coerce.number({ error: "Peab olema arv" }).int("Peab olema täisarv").min(min, `Vähemalt ${min}`).max(max, `Kuni ${max}`).nullable());
const decimal = (min: number, max: number) =>
  z.preprocess(
    (v) => (typeof v === "string" ? emptyToNull(v.replace(",", ".")) : v),
    z.coerce.number({ error: "Peab olema arv" }).min(min, `Vähemalt ${min}`).max(max, `Kuni ${max}`).nullable(),
  );
const triState = z.preprocess((v) => (v === "true" ? true : v === "false" ? false : null), z.boolean().nullable());
const enumOrNull = <T extends readonly [string, ...string[]]>(values: T) => z.preprocess(emptyToNull, z.enum(values).nullable());

/** "429", "429,50", "429.5 €" → sendid; tühi → null */
export const euroCents = z.preprocess(
  (v) => {
    if (typeof v !== "string") return v;
    const cleaned = v.replace(/[€\s]/g, "").replace(",", ".");
    return cleaned === "" ? null : cleaned;
  },
  z.coerce.number({ error: "Vigane summa" }).min(0, "Summa ei saa olla negatiivne").max(100_000, "Liiga suur summa").transform((euros) => Math.round(euros * 100)).nullable(),
);

export const modelEditSchema = z.object({
  // Tarnija/normaliseerimise väljad (salvestatakse parandusena)
  manufacturer: z.enum(BRAND_CODES, { error: "Vali tootja" }),
  family: requiredText(80),
  model: requiredText(80),
  generation: text(40),
  screenSizeIn: decimal(10, 18),
  weightKg: decimal(0.5, 5),
  // Admini väljad
  description: text(5000),
  status: z.enum(CATALOG_STATUS_VALUES),
  featured: z.preprocess((v) => v === "on" || v === "true", z.boolean()),
});
export type ModelEdit = z.infer<typeof modelEditSchema>;

export const listingEditSchema = z.object({
  cpu: text(120),
  cpuFamily: enumOrNull(CPU_FAMILIES),
  cpuGeneration: text(40),
  ramGb: int(1, 256),
  ramType: text(20),
  storageGb: int(1, 16_384),
  gpu: text(120),
  gpuDedicated: triState,
  screenSizeIn: decimal(10, 18),
  resolution: z.preprocess(emptyToNull, z.string().trim().regex(/^\d{3,4}x\d{3,4}$/, "Formaat: 1920x1080").nullable()),
  resolutionLabel: text(20),
  panel: text(20),
  touchscreen: triState,
  keyboard: enumOrNull(KEYBOARD_CODES as [string, ...string[]]),
  grade: enumOrNull(GRADE_CODES),
  stock: int(0, 100_000),
  supplierPriceCents: euroCents,
  operatingSystem: text(80),
  warrantyMonths: int(0, 120),
  batteryHealthPct: int(0, 100),
  chargerIncluded: triState,
  // Tarnija kvaliteedi kinnipidamine (Foxway rike): tühi = avaldatud; parandusena salvestub teadlik admini otsus
  // Puuduv väli (vanem vorm / API) = muutmata (pick jätab undefined välja) — kinnipidamist ei avaldata kogemata
  qualityHold: enumOrNull(QUALITY_HOLD_VALUES).optional(),
  // Admini väljad
  salePriceCents: euroCents,
  status: z.enum(CATALOG_STATUS_VALUES),
});
export type ListingEdit = z.infer<typeof listingEditSchema>;

/** FormData → tavaline objekt (ainult skeemis olevad väljad; checkbox puudumisel = väljas). */
export function formDataToObject(formData: FormData, keys: readonly string[]): Record<string, unknown> {
  return Object.fromEntries(keys.map((key) => [key, formData.get(key) ?? undefined]));
}

export function zodFieldErrors(error: z.ZodError): Record<string, string> {
  const result: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = String(issue.path[0] ?? "_");
    result[key] ??= issue.message;
  }
  return result;
}

export const MODEL_BULK_OPERATIONS = ["activate", "hide", "feature", "unfeature"] as const;
export const LISTING_BULK_OPERATIONS = ["activate", "hide"] as const;
export const bulkSchema = <T extends readonly [string, ...string[]]>(operations: T) =>
  z.object({
    operation: z.enum(operations),
    ids: z.array(z.uuid()).min(1, "Vali vähemalt üks rida").max(500),
  });

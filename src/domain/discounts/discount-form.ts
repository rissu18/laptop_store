import { z } from "zod";
import { BRAND_CODES } from "@/domain/catalog/types";
import { tallinnLocalToUtc } from "@/domain/time/tallinn";
import { normalizeCode, validateCodeFormat } from "./code";
import { DISCOUNT_SCOPES, DISCOUNT_TYPES } from "./discount-engine";

/**
 * Sooduskoodi vormi valideerimine. Sama funktsioon jookseb brauseris (kiire tagasiside)
 * ja serveris (ainus, mida usaldatakse). Kuupäevad sisestatakse Eesti ajas ja teisendatakse UTC-ks.
 */

const text = (max: number) =>
  z.preprocess((v) => (typeof v === "string" && v.trim() === "" ? null : v), z.string().trim().max(max, `Kuni ${max} märki`).nullable());

const decimal = (v: unknown) => (typeof v === "string" ? v.replace(/[€%\s]/g, "").replace(",", ".") : v);
const optionalEuroCents = z.preprocess(
  (v) => {
    const d = decimal(v);
    return d === "" || d === undefined || d === null ? null : d;
  },
  z.coerce.number({ error: "Peab olema summa" }).min(0, "Ei saa olla negatiivne").max(1_000_000, "Liiga suur summa").transform((e) => Math.round(e * 100)).nullable(),
);

const ids = z.array(z.uuid()).max(500);

const rawSchema = z.object({
  code: z.string().max(100),
  name: z.string().trim().min(1, "Kampaania nimi on kohustuslik").max(120, "Kuni 120 märki"),
  internalDescription: text(2000),
  type: z.enum(DISCOUNT_TYPES, { error: "Vali soodustuse tüüp" }),
  value: z.preprocess(decimal, z.string()),
  maximumDiscount: optionalEuroCents,
  minimumSubtotal: optionalEuroCents,
  startsAt: z.string().max(20),
  expiresAt: z.string().max(20),
  usageLimit: z.preprocess(
    (v) => (typeof v === "string" && v.trim() === "" ? null : v),
    z.coerce.number({ error: "Peab olema täisarv" }).int("Peab olema täisarv").min(1, "Vähemalt 1").max(1_000_000).nullable(),
  ),
  scope: z.enum(DISCOUNT_SCOPES),
  manufacturers: z.array(z.enum(BRAND_CODES)).max(20),
  productModelIds: ids,
  listingIds: ids,
  excludedProductModelIds: ids,
  excludedListingIds: ids,
  respectMinimumMargin: z.boolean(),
  status: z.enum(["DRAFT", "ACTIVE"]),
});

export interface DiscountFormData {
  code: string;
  normalizedCode: string;
  name: string;
  internalDescription: string | null;
  type: (typeof DISCOUNT_TYPES)[number];
  /** PERCENTAGE: baaspunktid; FIXED_AMOUNT: sendid; FREE_SHIPPING: 0 */
  value: number;
  maximumDiscountCents: number | null;
  minimumSubtotalCents: number | null;
  startsAt: Date | null;
  expiresAt: Date | null;
  usageLimit: number | null;
  scope: (typeof DISCOUNT_SCOPES)[number];
  manufacturers: string[];
  productModelIds: string[];
  listingIds: string[];
  excludedProductModelIds: string[];
  excludedListingIds: string[];
  respectMinimumMargin: boolean;
  status: "DRAFT" | "ACTIVE";
}

export type DiscountFormResult = { success: true; data: DiscountFormData } | { success: false; fieldErrors: Record<string, string> };

export function discountFormToObject(formData: FormData): Record<string, unknown> {
  const str = (key: string) => (formData.get(key) as string | null) ?? "";
  return {
    code: str("code"),
    name: str("name"),
    internalDescription: str("internalDescription"),
    type: str("type"),
    value: str("value"),
    maximumDiscount: str("maximumDiscount"),
    minimumSubtotal: str("minimumSubtotal"),
    startsAt: str("startsAt"),
    expiresAt: str("expiresAt"),
    usageLimit: str("usageLimit"),
    scope: str("scope") || "ALL_PRODUCTS",
    manufacturers: formData.getAll("manufacturers").map(String),
    productModelIds: formData.getAll("productModelIds").map(String),
    listingIds: formData.getAll("listingIds").map(String),
    excludedProductModelIds: formData.getAll("excludedProductModelIds").map(String),
    excludedListingIds: formData.getAll("excludedListingIds").map(String),
    respectMinimumMargin: formData.get("respectMinimumMargin") === "on",
    status: str("status") || "DRAFT",
  };
}

export function parseDiscountForm(input: Record<string, unknown>): DiscountFormResult {
  const errors: Record<string, string> = {};
  const parsed = rawSchema.safeParse(input);
  if (!parsed.success) {
    for (const issue of parsed.error.issues) errors[String(issue.path[0])] ??= issue.message;
    return { success: false, fieldErrors: errors };
  }
  const r = parsed.data;

  const codeError = validateCodeFormat(r.code);
  if (codeError) errors.code = codeError;

  let value = 0;
  const numeric = Number(r.value);
  if (r.type === "PERCENTAGE") {
    if (!r.value || !Number.isFinite(numeric) || numeric <= 0 || numeric > 100) errors.value = "Protsent peab olema vahemikus 0–100";
    else value = Math.round(numeric * 100);
  } else if (r.type === "FIXED_AMOUNT") {
    if (!r.value || !Number.isFinite(numeric) || numeric <= 0 || numeric > 100_000) errors.value = "Summa peab olema suurem kui 0 €";
    else value = Math.round(numeric * 100);
  }
  if (r.type === "PERCENTAGE" && r.maximumDiscount === 0) errors.maximumDiscount = "Maksimum peab olema suurem kui 0 € (või jäta tühjaks)";

  const startsAt = tallinnLocalToUtc(r.startsAt);
  const expiresAt = tallinnLocalToUtc(r.expiresAt);
  if (startsAt === "invalid") errors.startsAt = "Vigane kuupäev";
  if (expiresAt === "invalid") errors.expiresAt = "Vigane kuupäev";
  if (startsAt instanceof Date && expiresAt instanceof Date && expiresAt.getTime() <= startsAt.getTime()) errors.expiresAt = "Lõpp peab olema hiljem kui algus";

  if (r.scope === "SELECTED_MANUFACTURERS" && r.manufacturers.length === 0) errors.scope = "Vali vähemalt üks tootja";
  if (r.scope === "SELECTED_PRODUCT_MODELS" && r.productModelIds.length === 0) errors.scope = "Vali vähemalt üks mudel";
  if (r.scope === "SELECTED_LISTINGS" && r.listingIds.length === 0) errors.scope = "Vali vähemalt üks konfiguratsioon";

  if (Object.keys(errors).length) return { success: false, fieldErrors: errors };
  const unique = (list: string[]) => [...new Set(list)];
  return {
    success: true,
    data: {
      code: r.code.normalize("NFKC").trim(),
      normalizedCode: normalizeCode(r.code),
      name: r.name,
      internalDescription: r.internalDescription,
      type: r.type,
      value,
      maximumDiscountCents: r.type === "PERCENTAGE" ? r.maximumDiscount : null,
      minimumSubtotalCents: r.minimumSubtotal && r.minimumSubtotal > 0 ? r.minimumSubtotal : null,
      startsAt: startsAt as Date | null,
      expiresAt: expiresAt as Date | null,
      usageLimit: r.usageLimit,
      scope: r.scope,
      // Ainult valitud kehtivusala valikud salvestatakse (teised tühjendatakse)
      manufacturers: r.scope === "SELECTED_MANUFACTURERS" ? unique(r.manufacturers) : [],
      productModelIds: r.scope === "SELECTED_PRODUCT_MODELS" ? unique(r.productModelIds) : [],
      listingIds: r.scope === "SELECTED_LISTINGS" ? unique(r.listingIds) : [],
      excludedProductModelIds: unique(r.excludedProductModelIds),
      excludedListingIds: unique(r.excludedListingIds),
      respectMinimumMargin: r.respectMinimumMargin,
      status: r.status,
    },
  };
}

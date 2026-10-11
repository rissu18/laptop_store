import { z } from "zod";

/**
 * Kassa vormi valideerimine (sama skeem brauseris ja serveris; serveris kohustuslik).
 * Küsitakse ainult tellimuse täitmiseks vajalikku — mitte isikukoodi, sünniaega ega muud.
 */

/** Toetatud riigid. Uue riigi lisamiseks: lisa siia ja postiindeksi reegel allpool. */
export const CHECKOUT_COUNTRIES = { EE: "Eesti" } as const;
export type CheckoutCountry = keyof typeof CHECKOUT_COUNTRIES;

const POSTAL_CODE_RULES: Record<string, { pattern: RegExp; message: string }> = {
  EE: { pattern: /^\d{5}$/, message: "Eesti postiindeks on 5 numbrit (nt 10115)" },
};
const GENERIC_POSTAL = { pattern: /^[A-Za-z0-9 -]{2,12}$/, message: "Vigane postiindeks" };

const REGISTRY_CODE_RULES: Record<string, { pattern: RegExp; message: string }> = {
  EE: { pattern: /^\d{8}$/, message: "Eesti registrikood on 8 numbrit" },
};

/** Tingimustega nõustumine on kohustuslik (kontrollitakse ka serveris — placeOrderAction → parseCheckoutForm). */
export const TERMS_REQUIRED_MESSAGE = "Tellimuse esitamiseks pead nõustuma E-poe tingimustega.";
export const TERMS_HREF = "/info/muugitingimused";

const required = (label: string, max: number) => z.string().trim().min(1, `${label} on kohustuslik`).max(max, `Kuni ${max} märki`);
const optional = (max: number) =>
  z.preprocess((v) => (typeof v === "string" && v.trim() === "" ? null : v), z.string().trim().max(max, `Kuni ${max} märki`).nullable());

export const checkoutFormSchema = z
  .object({
    firstName: required("Eesnimi", 60),
    lastName: required("Perekonnanimi", 60),
    email: z.string().trim().toLowerCase().max(200).pipe(z.email("Vigane e-posti aadress")),
    phone: z
      .string()
      .trim()
      .regex(/^\+?[0-9 ()-]{6,20}$/, "Vigane telefoninumber (nt +372 5123 4567)")
      .refine((v) => v.replace(/\D/g, "").length >= 6, "Vigane telefoninumber"),
    addressLine1: required("Aadress", 120),
    addressLine2: optional(120),
    city: required("Linn", 60),
    postalCode: z.string().trim().max(12),
    country: z.enum(Object.keys(CHECKOUT_COUNTRIES) as [CheckoutCountry, ...CheckoutCountry[]], { error: "Vali riik" }),
    isCompany: z.boolean(),
    companyName: optional(120),
    companyRegistryCode: optional(20),
    companyVatNumber: optional(20),
    customerNote: optional(1000),
    // Ainult true; puuduv, false või "on" tekst → viga. Vaikimisi märkimata (kassa vormis).
    acceptTerms: z.literal(true, { error: TERMS_REQUIRED_MESSAGE }),
  })
  .superRefine((data, ctx) => {
    const postal = POSTAL_CODE_RULES[data.country] ?? GENERIC_POSTAL;
    if (!postal.pattern.test(data.postalCode)) ctx.addIssue({ code: "custom", path: ["postalCode"], message: postal.message });
    if (data.isCompany) {
      if (!data.companyName) ctx.addIssue({ code: "custom", path: ["companyName"], message: "Ettevõtte nimi on kohustuslik" });
      const reg = REGISTRY_CODE_RULES[data.country];
      if (!data.companyRegistryCode) ctx.addIssue({ code: "custom", path: ["companyRegistryCode"], message: "Registrikood on kohustuslik" });
      else if (reg && !reg.pattern.test(data.companyRegistryCode)) ctx.addIssue({ code: "custom", path: ["companyRegistryCode"], message: reg.message });
      if (data.companyVatNumber && !/^[A-Z]{2}[0-9A-Z]{2,13}$/.test(data.companyVatNumber.toUpperCase())) {
        ctx.addIssue({ code: "custom", path: ["companyVatNumber"], message: "KMKR number nt EE101234567" });
      }
    }
  })
  .transform(({ acceptTerms, ...data }) => {
    // Nõustumine on eeltingimus; tellimuse andmetesse see ei lähe (tellimuse loomine ei muutu)
    void acceptTerms;
    return data.isCompany
      ? { ...data, companyVatNumber: data.companyVatNumber?.toUpperCase() ?? null }
      : // Eraisiku ostul ettevõtte välju ei salvestata (ka siis, kui need olid täidetud)
        { ...data, companyName: null, companyRegistryCode: null, companyVatNumber: null };
  });

export type CheckoutForm = z.infer<typeof checkoutFormSchema>;

export function parseCheckoutForm(input: unknown): { success: true; data: CheckoutForm } | { success: false; fieldErrors: Record<string, string> } {
  const parsed = checkoutFormSchema.safeParse(input);
  if (parsed.success) return { success: true, data: parsed.data };
  const fieldErrors: Record<string, string> = {};
  for (const issue of parsed.error.issues) fieldErrors[String(issue.path[0] ?? "_")] ??= issue.message;
  return { success: false, fieldErrors };
}

import { TRUST_ITEM_KEYS, type SettingsKey } from "@/domain/settings/settings";

/**
 * Seadete vorm → toorobjekt, mida valideerib SETTINGS_SCHEMAS[key] (zod).
 * Tühi tekst salvestub kui null ("puudub") — nii ei kuvata poes tühje või väljamõeldud väärtusi.
 */
const text = (formData: FormData, name: string): string | null => {
  const value = formData.get(name);
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
};

const euroToCents = (value: string | null): number | null | string => {
  if (value === null) return null;
  const n = Number(value.replace(/[€\s]/g, "").replace(",", "."));
  return Number.isFinite(n) ? Math.round(n * 100) : value; // vigane väärtus jõuab zod'i ja annab veateate
};

export const EDITABLE_SETTINGS = ["general", "store", "delivery", "warranty", "returns", "trustBar"] as const satisfies readonly SettingsKey[];
export type EditableSettingsKey = (typeof EDITABLE_SETTINGS)[number];

export function settingsFromForm(key: EditableSettingsKey, formData: FormData): unknown {
  switch (key) {
    case "general":
      return {
        storeName: text(formData, "storeName") ?? "",
        supportEmail: text(formData, "supportEmail"),
        phone: text(formData, "phone"),
        companyName: text(formData, "companyName"),
        registryCode: text(formData, "registryCode"),
        address: text(formData, "address"),
      };
    case "store":
      return { prototypeMode: formData.get("prototypeMode") === "on", currency: text(formData, "currency"), locale: text(formData, "locale") };
    case "delivery":
      return {
        infoText: text(formData, "infoText"),
        freeShippingThresholdCents: euroToCents(text(formData, "freeShippingThreshold")),
        // Puuduv väli → vaikeväärtus (zod default); tühjaks jäetud väli → valideerimisviga
        standardShippingName: formData.has("standardShippingName") ? (text(formData, "standardShippingName") ?? "") : undefined,
        standardShippingCents: formData.has("standardShippingPrice") ? (euroToCents(text(formData, "standardShippingPrice")) ?? "") : undefined,
      };
    case "warranty":
    case "returns":
      return { text: text(formData, "text") };
    case "trustBar":
      return {
        items: TRUST_ITEM_KEYS.filter((itemKey) => formData.has(`trust.${itemKey}.label`)).map((itemKey) => ({
          key: itemKey,
          enabled: formData.get(`trust.${itemKey}.enabled`) === "on",
          label: text(formData, `trust.${itemKey}.label`) ?? "",
          text: text(formData, `trust.${itemKey}.text`) ?? "",
          order: Number(formData.get(`trust.${itemKey}.order`) ?? 0),
        })),
      };
  }
}

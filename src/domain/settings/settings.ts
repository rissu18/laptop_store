import { z } from "zod";
import type { PricingBand, PricingConfig, RoundingRule } from "@/domain/pricing/pricing-engine";

/**
 * Poe seaded (andmebaasis tabelis store_settings, võti → JSON).
 * Iga grupi struktuur valideeritakse siin zod-skeemiga — nii lugemisel kui salvestamisel.
 *
 * OLULINE: üldseaded on POE info (nt garantii üldtekst). Need ei tähenda, et igal pakkumisel on
 * see väärtus — pakkumise garantii, aku jm tulevad ainult tarnija andmetest (puudumisel ei kuvata).
 */

const optionalText = (max: number) => z.string().trim().max(max).nullable();

export const generalSettingsSchema = z.object({
  storeName: z.string().trim().min(1, "Poe nimi on kohustuslik").max(80),
  supportEmail: z.union([z.literal(""), z.email("Vigane e-posti aadress")]).nullable(),
  phone: optionalText(40),
  companyName: optionalText(120),
  registryCode: optionalText(20),
  address: optionalText(200),
});

export const storeModeSettingsSchema = z.object({
  prototypeMode: z.boolean(),
  currency: z.enum(["EUR"]),
  locale: z.enum(["et-EE"]),
});

export const deliverySettingsSchema = z.object({
  infoText: optionalText(500),
  /** Tasuta tarne alates (sentides); null = tasuta tarnet pole */
  freeShippingThresholdCents: z.number().int().min(0).max(1_000_000).nullable(),
});

export const textSettingsSchema = z.object({ text: optionalText(2000) });

export const TRUST_ITEM_KEYS = ["warranty", "returns", "delivery", "payment", "inspected"] as const;
export const trustBarSettingsSchema = z.object({
  items: z
    .array(
      z.object({
        key: z.enum(TRUST_ITEM_KEYS),
        enabled: z.boolean(),
        label: z.string().trim().min(1).max(60),
        text: z.string().trim().max(120),
        order: z.number().int().min(0).max(99),
      }),
    )
    .max(TRUST_ITEM_KEYS.length),
});

export const ROUNDING_MODES = ["ending-9", "whole-euro", "none"] as const;
export const pricingSettingsSchema = z.object({
  vatRateBps: z.number().int().min(0).max(5000),
  supplierShippingCents: z.number().int().min(0).max(100_000),
  warrantyReserveBps: z.number().int().min(0).max(5000),
  paymentFeeBps: z.number().int().min(0).max(1000),
  paymentFeeFixedCents: z.number().int().min(0).max(10_000),
  minProfitCents: z.number().int().min(0).max(1_000_000),
  minProfitBps: z.number().int().min(0).max(9000),
  minSalePriceCents: z.number().int().min(0).max(1_000_000),
  rounding: z.enum(ROUNDING_MODES),
});

export const SETTINGS_SCHEMAS = {
  general: generalSettingsSchema,
  store: storeModeSettingsSchema,
  delivery: deliverySettingsSchema,
  warranty: textSettingsSchema,
  returns: textSettingsSchema,
  trustBar: trustBarSettingsSchema,
  pricing: pricingSettingsSchema,
} as const;

export type SettingsKey = keyof typeof SETTINGS_SCHEMAS;
export type Settings = { [K in SettingsKey]: z.infer<(typeof SETTINGS_SCHEMAS)[K]> };

/** Algväärtused (seed). Kinnitamata ärilised väited on märgitud prototüübi juurde. */
export const DEFAULT_SETTINGS: Settings = {
  general: { storeName: "Sülearvutid.ee", supportEmail: null, phone: null, companyName: null, registryCode: null, address: null },
  store: { prototypeMode: true, currency: "EUR", locale: "et-EE" },
  delivery: { infoText: "Pakiautomaati või kulleriga üle Eesti.", freeShippingThresholdCents: null },
  warranty: { text: null },
  returns: { text: "E-poest ostes on tarbijal seadusest tulenev õigus 14 päeva jooksul lepingust taganeda." },
  trustBar: {
    items: [
      { key: "warranty", enabled: true, label: "Garantii", text: "Garantii tingimused lisatakse", order: 0 },
      { key: "returns", enabled: true, label: "14-päevane taganemisõigus", text: "Seadusest tulenev õigus e-ostust taganeda", order: 1 },
      { key: "delivery", enabled: true, label: "Tarne üle Eesti", text: "Pakiautomaati või kulleriga", order: 2 },
      { key: "payment", enabled: true, label: "Turvaline maksmine", text: "Pangalingid ja kaardimakse", order: 3 },
    ],
  },
  pricing: {
    vatRateBps: 2400,
    supplierShippingCents: 1500,
    warrantyReserveBps: 300,
    paymentFeeBps: 150,
    paymentFeeFixedCents: 15,
    minProfitCents: 3000,
    minProfitBps: 600,
    minSalePriceCents: 9900,
    rounding: "ending-9",
  },
};

/** Loeb seade ja täidab puuduva/vigase väärtuse vaikeväärtusega (vigane DB väärtus ei too poodi maha). */
export function parseSetting<K extends SettingsKey>(key: K, value: unknown): Settings[K] {
  const parsed = SETTINGS_SCHEMAS[key].safeParse(value);
  return (parsed.success ? parsed.data : DEFAULT_SETTINGS[key]) as Settings[K];
}

export function roundingRulesFor(mode: Settings["pricing"]["rounding"]): RoundingRule[] {
  switch (mode) {
    case "ending-9":
      return [
        { fromCents: 0, stepCents: 1_000, endingCents: 900 }, // 429, 439, 499 …
        { fromCents: 100_000, stepCents: 5_000, endingCents: 4_900 }, // 1049, 1099 …
      ];
    case "whole-euro":
      return [{ fromCents: 0, stepCents: 100, endingCents: 0 }];
    case "none":
      return [{ fromCents: 0, stepCents: 1, endingCents: 0 }];
  }
}

/** Andmebaasi hinnareeglid + seaded → hinnastamismootori konfiguratsioon. */
export function toPricingConfig(settings: Settings["pricing"], bands: PricingBand[]): PricingConfig {
  return {
    vatRateBps: settings.vatRateBps,
    supplierShippingCents: settings.supplierShippingCents,
    warrantyReserveBps: settings.warrantyReserveBps,
    paymentFeeBps: settings.paymentFeeBps,
    paymentFeeFixedCents: settings.paymentFeeFixedCents,
    bands: [...bands].sort((a, b) => a.fromCostCents - b.fromCostCents),
    rounding: roundingRulesFor(settings.rounding),
    minProfitCents: settings.minProfitCents,
    minProfitBps: settings.minProfitBps,
    minSalePriceCents: settings.minSalePriceCents,
  };
}

import { env } from "./env";

/**
 * Poe üldseaded.
 * Phase 3-s liiguvad need andmebaasi (`SystemSetting`) ja on administ muudetavad.
 *
 * REEGEL: ühtegi turundusväidet ei kuvata, mida me ei suuda tõestada.
 * Iga väide on märgitud `confirmed: true` alles siis, kui see on päriselt kokku lepitud.
 * Kinnitamata väiteid näidatakse ainult prototüübirežiimis (PROTOTYPE_MODE=true).
 */

export interface TrustItem {
  key: "warranty" | "returns" | "delivery" | "payment" | "inspected";
  title: string;
  detail: string;
  confirmed: boolean;
}

const TRUST_ITEMS: TrustItem[] = [
  {
    key: "warranty",
    title: "Garantii",
    // TODO: REAL PROVIDER DATA REQUIRED — garantii pikkus ja tingimused
    detail: "Garantii tingimused lisatakse",
    confirmed: false,
  },
  {
    key: "returns",
    title: "14-päevane taganemisõigus",
    // Seadusest tulenev (VÕS) — kehtib e-poes alati tarbijale
    detail: "Seadusest tulenev õigus e-ostust taganeda",
    confirmed: true,
  },
  {
    key: "delivery",
    title: "Tarne üle Eesti",
    // TODO: REAL PROVIDER DATA REQUIRED — tarneviisid ja hinnad
    detail: "Pakiautomaati või kulleriga",
    confirmed: false,
  },
  {
    key: "payment",
    title: "Turvaline maksmine",
    // TODO: REAL PROVIDER DATA REQUIRED — kinnitatakse pärast makseteenuse lepingut (Phase 6)
    detail: "Pangalingid ja kaardimakse",
    confirmed: false,
  },
];

export const storeConfig = {
  // TODO: REAL PROVIDER DATA REQUIRED — poe lõplik nimi, ettevõte ja kontaktid
  name: "Sülearvutipood",
  legalName: null as string | null,
  registryCode: null as string | null,
  email: null as string | null,
  phone: null as string | null,
  siteUrl: env.SITE_URL,
  prototypeMode: env.PROTOTYPE_MODE,

  /** Kas automaatne sync on päriselt töös — alles siis võib seda avalikult väita. */
  autoSyncActive: false,

  // TODO: REAL PROVIDER DATA REQUIRED — tarnija tegelik tarneaeg
  delivery: { minDays: 2, maxDays: 4 },

  // TODO: REAL PROVIDER DATA REQUIRED — tarneviisid ja hinnad (Phase 5: ShippingProvider)
  shippingMethods: [
    { code: "parcel-locker", label: "Pakiautomaat", priceCents: 399 },
    { code: "courier", label: "Kuller", priceCents: 699 },
  ],
  freeShippingFromCents: null as number | null,
};

/** Usaldusväited, mida tohib praeguses režiimis näidata. */
export function getVisibleTrustItems(): TrustItem[] {
  return TRUST_ITEMS.filter((item) => item.confirmed || storeConfig.prototypeMode);
}

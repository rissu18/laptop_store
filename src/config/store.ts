import { env } from "./env";

/**
 * Poe tehnilised seaded, mis EI ole administ muudetavad.
 *
 * Poe nimi, ettevõtte andmed, prototüübirežiim ja usaldusriba on andmebaasis (store_settings)
 * ja muudetavad adminis (Seaded) — vt src/server/settings/settings-service.ts.
 */

export interface TrustItem {
  key: "warranty" | "returns" | "delivery" | "payment" | "inspected";
  title: string;
  detail: string;
}

export const storeConfig = {
  siteUrl: env.SITE_URL,

  /** Kas automaatne sync on päriselt töös — alles siis võib seda avalikult väita. */
  autoSyncActive: false,

  // TODO: REAL PROVIDER DATA REQUIRED — tarneviisid ja hinnad (Phase 5: ShippingProvider)
  shippingMethods: [
    { code: "parcel-locker", label: "Pakiautomaat", priceCents: 399 },
    { code: "courier", label: "Kuller", priceCents: 699 },
  ],
};

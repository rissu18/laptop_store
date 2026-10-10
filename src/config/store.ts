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

  // Tarneviisid ja hinnad on poe seadetes (admin → Seaded → Tarne), vt src/domain/shipping/shipping.ts
};

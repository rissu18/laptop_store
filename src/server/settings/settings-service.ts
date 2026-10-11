import "server-only";
import type { TrustItem } from "@/config/store";
import { cacheLife, cacheTag } from "next/cache";
import { resolveCheckoutMode } from "@/domain/checkout/checkout-mode";
import { DEFAULT_SETTINGS, type Settings } from "@/domain/settings/settings";
import { storefrontTrustItems } from "@/domain/storefront/storefront-notices";
import { getConfiguredPaymentProvider } from "@/server/payments/payment-provider";
import { getDb, isDatabaseConfigured } from "@/server/db/client";
import { readSettings } from "./read-settings";
import { errorMessage, newErrorId, writeSystemLog } from "@/server/logging/system-log";

import { SETTINGS_CACHE_TAG } from "@/server/cache-tags";

/**
 * Poe seaded andmebaasist (admin → Seaded). Vahemälus kuni admin muudab (updateTag('settings')).
 * Kui andmebaas pole seadistatud (lokaalne arendus ilma DB-ta), kasutatakse vaikeseadeid.
 * Vigane üksik väärtus asendatakse vaikeväärtusega (parseSetting), andmebaasi viga visatakse edasi.
 */
export async function getSettings(): Promise<Settings> {
  "use cache";
  cacheTag(SETTINGS_CACHE_TAG);
  cacheLife("max");
  if (!isDatabaseConfigured()) return DEFAULT_SETTINGS;
  try {
    return await readSettings(getDb());
  } catch (error) {
    const errorId = newErrorId();
    await writeSystemLog({ level: "ERROR", source: "DATABASE", message: "Seadete laadimine ebaõnnestus", details: { reason: errorMessage(error) }, errorId });
    throw new Error(`Seadete laadimine ebaõnnestus (viga ${errorId})`);
  }
}

/** Kas päris maksed on avatud (LIVE kassa). Seni ei väideta poes, et maksmine töötab. */
export function arePaymentsLive(settings: Settings): boolean {
  return resolveCheckoutMode({ prototypeMode: settings.store.prototypeMode, paymentProviderConfigured: getConfiguredPaymentProvider() !== null }) === "LIVE";
}

/** Usaldusriba: ainult admini lubatud punktid, järjekorras; makse-punkt aus seni, kuni maksed pole avatud. */
export function visibleTrustItems(settings: Settings): TrustItem[] {
  const items = settings.trustBar.items
    .filter((item) => item.enabled)
    .sort((a, b) => a.order - b.order)
    .map((item) => ({ key: item.key, title: item.label, detail: item.text }));
  return storefrontTrustItems(items, arePaymentsLive(settings));
}

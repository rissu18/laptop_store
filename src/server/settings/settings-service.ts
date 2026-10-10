import "server-only";
import type { TrustItem } from "@/config/store";
import { cacheLife, cacheTag } from "next/cache";
import { DEFAULT_SETTINGS, SETTINGS_SCHEMAS, parseSetting, type Settings, type SettingsKey } from "@/domain/settings/settings";
import { getDb, isDatabaseConfigured } from "@/server/db/client";
import { storeSettings } from "@/server/db/schema";
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
    const rows = await getDb().select().from(storeSettings);
    const byKey = new Map(rows.map((row) => [row.key, row.value]));
    const result = {} as Record<SettingsKey, unknown>;
    for (const key of Object.keys(SETTINGS_SCHEMAS) as SettingsKey[]) {
      result[key] = byKey.has(key) ? parseSetting(key, byKey.get(key)) : DEFAULT_SETTINGS[key];
    }
    return result as Settings;
  } catch (error) {
    const errorId = newErrorId();
    await writeSystemLog({ level: "ERROR", source: "DATABASE", message: "Seadete laadimine ebaõnnestus", details: { reason: errorMessage(error) }, errorId });
    throw new Error(`Seadete laadimine ebaõnnestus (viga ${errorId})`);
  }
}

/** Usaldusriba: ainult admini lubatud punktid, järjekorras. */
export function visibleTrustItems(settings: Settings): TrustItem[] {
  return settings.trustBar.items
    .filter((item) => item.enabled)
    .sort((a, b) => a.order - b.order)
    .map((item) => ({ key: item.key, title: item.label, detail: item.text }));
}

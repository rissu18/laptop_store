import { DEFAULT_SETTINGS, SETTINGS_SCHEMAS, parseSetting, type Settings, type SettingsKey } from "@/domain/settings/settings";
import type { Database } from "@/server/db/client";
import { storeSettings } from "@/server/db/schema";

/**
 * Seaded otse andmebaasist ILMA vahemäluta — kassa ja tellimuse loomine peavad nägema kehtivat
 * tarnehinda ja prototüübirežiimi, mitte vahemälus olevat versiooni.
 */
export async function readSettings(db: Pick<Database, "select">): Promise<Settings> {
  const rows = await db.select().from(storeSettings);
  const byKey = new Map(rows.map((row) => [row.key, row.value]));
  const result = {} as Record<SettingsKey, unknown>;
  for (const key of Object.keys(SETTINGS_SCHEMAS) as SettingsKey[]) {
    result[key] = byKey.has(key) ? parseSetting(key, byKey.get(key)) : DEFAULT_SETTINGS[key];
  }
  return result as Settings;
}

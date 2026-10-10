import "server-only";
import { DEFAULT_SETTINGS, SETTINGS_SCHEMAS, parseSetting, type Settings, type SettingsKey } from "@/domain/settings/settings";
import { requireAdmin } from "@/server/auth/auth";
import { getDb } from "@/server/db/client";
import { storeSettings } from "@/server/db/schema";

/** Seaded adminile — alati värskelt andmebaasist (mitte poe vahemälust). */
export async function getAdminSettings(): Promise<{ settings: Settings; updated: Record<string, { at: Date; by: string | null }> }> {
  await requireAdmin();
  const rows = await getDb().select().from(storeSettings);
  const byKey = new Map(rows.map((row) => [row.key, row]));
  const settings = Object.fromEntries(
    (Object.keys(SETTINGS_SCHEMAS) as SettingsKey[]).map((key) => [key, byKey.has(key) ? parseSetting(key, byKey.get(key)!.value) : DEFAULT_SETTINGS[key]]),
  ) as Settings;
  const updated = Object.fromEntries(rows.map((row) => [row.key, { at: row.updatedAt, by: row.updatedBy }]));
  return { settings, updated };
}

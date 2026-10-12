import "server-only";
import { fetchFoxwayFeeds } from "@/integrations/foxway/foxway-client";
import { getDb } from "@/server/db/client";
import { writeSystemLog } from "@/server/logging/system-log";
import { runFoxwaySync, type FoxwaySyncResult } from "./foxway-sync";
import type { SyncTrigger } from "./sync-runs";

/**
 * Päris Foxway sync'i käivitamine (admin "Sync now", cron-otspunkt, CLI): Foxway API (4 hinnakirja päringut) ja
 * süsteemilogi (allikas FOXWAY). Vahemälu tühjendab kutsuja (server action → updateTag, route handler → revalidateTag).
 */
export async function runFoxwaySyncNow(input: { trigger: SyncTrigger; triggeredBy?: string | null; allowLargeDrop?: boolean }): Promise<FoxwaySyncResult> {
  return runFoxwaySync(getDb(), {
    ...input,
    loadFeeds: async () => (await fetchFoxwayFeeds()).map(({ feed, pricelist }) => ({ feed, pricelist })),
    log: (entry) => writeSystemLog({ ...entry, source: "FOXWAY" }),
  });
}

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
    loadFeeds: async () => {
      const results = await fetchFoxwayFeeds();
      // Diagnostika: iga päringu ridade arv, võrgumaht, katsete arv ja kestus (võtmeta)
      await writeSystemLog({
        level: "INFO",
        source: "FOXWAY",
        message: "Foxway feed'id laaditud",
        details: { feeds: results.map((r) => ({ feed: r.feed.key, rows: r.pricelist.lines.length, invalid: r.pricelist.invalid.length, wireBytes: r.wireBytes, attempts: r.attempts, durationMs: r.durationMs })) },
      });
      return results.map(({ feed, pricelist }) => ({ feed, pricelist }));
    },
    log: (entry) => writeSystemLog({ ...entry, source: "FOXWAY" }),
  });
}

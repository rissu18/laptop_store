import "server-only";
import { fetchLaptopidRaw } from "@/integrations/laptopid/laptopid-client";
import { getDb } from "@/server/db/client";
import { writeSystemLog } from "@/server/logging/system-log";
import { createImageSizeProbe } from "./image-probe";
import { runLaptopidSync, type LaptopidSyncResult } from "./laptopid-sync";
import type { SyncTrigger } from "./sync-runs";

/**
 * Päris sync'i käivitamine (admin "Sync now", cron-otspunkt, CLI): päris API klient, pildi mõõtude
 * lugeja ja süsteemilogi (allikas LAPTOPID). Vahemälu tühjendab kutsuja (server action → updateTag,
 * route handler → revalidateTag), sest see sõltub kontekstist.
 */
export async function runLaptopidSyncNow(input: { trigger: SyncTrigger; triggeredBy?: string | null; allowLargeDrop?: boolean }): Promise<LaptopidSyncResult> {
  return runLaptopidSync(getDb(), {
    ...input,
    fetchRaw: () => fetchLaptopidRaw(),
    probeImage: createImageSizeProbe(),
    log: (entry) => writeSystemLog({ ...entry, source: "LAPTOPID" }),
  });
}

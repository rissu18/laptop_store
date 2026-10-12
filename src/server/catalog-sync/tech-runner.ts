import "server-only";
import { fetchTechWorkbook } from "@/integrations/tech/tech-client";
import { readTechWorkbook } from "@/integrations/tech/tech-workbook";
import { getDb } from "@/server/db/client";
import { writeSystemLog } from "@/server/logging/system-log";
import { runTechSync, type TechSyncResult } from "./tech-sync";
import type { SyncTrigger } from "./sync-runs";

/**
 * Päris Tech sync'i käivitamine (admin "Sync now", cron-otspunkt, CLI): Google Sheetsi XLSX eksport, ExcelJS
 * ja süsteemilogi (allikas TECH). Vahemälu tühjendab kutsuja (server action → updateTag, route handler →
 * revalidateTag), sest see sõltub kontekstist.
 */
export async function runTechSyncNow(input: { trigger: SyncTrigger; triggeredBy?: string | null; allowLargeDrop?: boolean }): Promise<TechSyncResult> {
  return runTechSync(getDb(), {
    ...input,
    loadSheets: async () => readTechWorkbook((await fetchTechWorkbook()).data),
    log: (entry) => writeSystemLog({ ...entry, source: "TECH" }),
  });
}

import { revalidateTag } from "next/cache";
import type { NextRequest } from "next/server";
import { isLaptopidConfigured } from "@/integrations/laptopid/laptopid-client";
import { CATALOG_CACHE_TAG } from "@/server/cache-tags";
import { isAuthorizedCronRequest, isCronConfigured } from "@/server/catalog-sync/cron-auth";
import { runLaptopidSyncNow } from "@/server/catalog-sync/laptopid-runner";

/**
 * Ajastatud Laptopid.ee sync (Vercel Cron või muu ajastaja). Kaitstud: `Authorization: Bearer <CRON_SECRET>`.
 * Ilma CRON_SECRET-ita ei käivitu kunagi (fail-closed). Vt docs/LAPTOPID_SYNC.md → "Ajastamine".
 *
 * Vastus ei sisalda tooteandmeid ega saladusi — ainult sync'i kokkuvõte.
 */
export const maxDuration = 300;

export async function GET(request: NextRequest) {
  if (!isCronConfigured()) return Response.json({ error: "Not configured" }, { status: 503, headers: { "Cache-Control": "no-store" } });
  if (!isAuthorizedCronRequest(request.headers.get("authorization"))) {
    return Response.json({ error: "Unauthorized" }, { status: 401, headers: { "Cache-Control": "no-store" } });
  }
  if (!isLaptopidConfigured()) return Response.json({ error: "Laptopid API not configured" }, { status: 503, headers: { "Cache-Control": "no-store" } });

  const result = await runLaptopidSyncNow({ trigger: "CRON", triggeredBy: "cron" });
  if (result.status === "SUCCESS" && result.changed) {
    // Väljaspool server action'it updateTag pole saadaval → aegu kohe, järgmine päring loeb värske kataloogi
    revalidateTag(CATALOG_CACHE_TAG, { expire: 0 });
  }
  const body =
    result.status === "BUSY"
      ? { status: "BUSY" }
      : result.status === "FAILED"
        ? { status: "FAILED", runId: result.runId }
        : { status: "SUCCESS", runId: result.runId, snapshotTrusted: result.snapshotTrusted, stats: result.stats };
  return Response.json(body, { status: result.status === "FAILED" ? 502 : 200, headers: { "Cache-Control": "no-store" } });
}

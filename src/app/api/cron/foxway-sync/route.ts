import { revalidateTag } from "next/cache";
import type { NextRequest } from "next/server";
import { isFoxwayConfigured } from "@/integrations/foxway/foxway-config";
import { CATALOG_CACHE_TAG } from "@/server/cache-tags";
import { isAuthorizedCronRequest, isCronConfigured } from "@/server/catalog-sync/cron-auth";
import { runFoxwaySyncNow } from "@/server/catalog-sync/foxway-runner";

/**
 * Ajastatud Foxway sync (Upstash QStash, Europe/Tallinn: päeval iga 30 min, öösel iga 2 h). Kaitstud:
 * `Authorization: Bearer <CRON_SECRET>`. Ilma CRON_SECRET-ita ei käivitu kunagi (fail-closed). Vt docs/FOXWAY_SYNC.md.
 *
 * Vastus ei sisalda tooteandmeid ega saladusi (FOXWAY_API_KEY) — ainult sync'i kokkuvõte.
 */
export const maxDuration = 300;

export async function GET(request: NextRequest) {
  const headers = { "Cache-Control": "no-store" };
  if (!isCronConfigured()) return Response.json({ error: "Not configured" }, { status: 503, headers });
  if (!isAuthorizedCronRequest(request.headers.get("authorization"))) return Response.json({ error: "Unauthorized" }, { status: 401, headers });
  if (!isFoxwayConfigured()) return Response.json({ error: "Foxway API not configured" }, { status: 503, headers });

  const result = await runFoxwaySyncNow({ trigger: "CRON", triggeredBy: "cron" });
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
  return Response.json(body, { status: result.status === "FAILED" ? 502 : 200, headers });
}

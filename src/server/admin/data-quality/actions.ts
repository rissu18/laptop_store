"use server";

import { refresh, updateTag } from "next/cache";
import { CATALOG_CACHE_TAG } from "@/server/cache-tags";
import { getDb } from "@/server/db/client";
import { runCatalogEnrichment } from "@/server/enrichment/catalog-enrichment";
import { writeSystemLog } from "@/server/logging/system-log";
import { ok, type ActionResult } from "../action-result";
import { writeAudit } from "../audit";
import { runAdminAction } from "../run-action";

/**
 * Admin → Andmekvaliteet → "Rikasta kataloogi": sama teenus mis `npm run enrich:catalog` (Laptopid.ee pildid mudelitele +
 * GPU/resolutsiooni rikastus), tulemus meie andmebaasi ja poe vahemälu tühjendatakse. Icecati allalaadimist siin ei
 * tehta (Vercelis pole püsivat pildisalvestust) — see on lokaalne `npm run enrich:catalog -- --images --icecat`.
 */
export async function enrichCatalogAction(): Promise<ActionResult> {
  return runAdminAction("catalog.enrich", async (admin) => {
    const db = getDb();
    const report = await runCatalogEnrichment(db, { images: true, specs: true });
    const images = report.images!;
    const specs = report.specs!;
    await writeAudit(db, admin, {
      action: "catalog.enrich",
      entityType: "Catalog",
      entityId: "enrichment",
      entityLabel: "Kataloogi rikastus",
      changes: {
        imagesLinked: { from: null, to: images.linkedLaptopidSameModel + images.linkedLaptopidMatched },
        gpuEnriched: { from: null, to: specs.gpuEnriched.laptopid + specs.gpuEnriched.local },
      },
    });
    await writeSystemLog({ level: "INFO", source: "ADMIN", message: "Kataloogi rikastus (admin)", details: { admin: admin.email, status: images.status, after: images.after, changedListings: specs.changedListings } });
    updateTag(CATALOG_CACHE_TAG);
    refresh();
    return ok(
      `Rikastus tehtud: poes pildiga mudeleid ${images.after.withImages} (enne ${images.before.withImages}); ülevaatusel ${images.review}, vasteta ${images.unresolved}; GPU täpsustatud ${specs.gpuEnriched.laptopid + specs.gpuEnriched.local} pakkumisel.`,
    );
  });
}

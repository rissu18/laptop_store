"use server";

import { refresh, updateTag } from "next/cache";
import { isLaptopidConfigured } from "@/integrations/laptopid/laptopid-client";
import { CATALOG_CACHE_TAG } from "@/server/cache-tags";
import { runLaptopidSyncNow } from "@/server/catalog-sync/laptopid-runner";
import { runTechSyncNow } from "@/server/catalog-sync/tech-runner";
import { isTechConfigured } from "@/integrations/tech/tech-client";
import { getDb } from "@/server/db/client";
import { fail, ok, type ActionResult } from "../action-result";
import { writeAudit } from "../audit";
import { runAdminAction } from "../run-action";

/**
 * Admin → Tarnijad → "Sync now". Kaitse nagu kõigil admini toimingutel (runAdminAction: päritolu/CSRF +
 * sessioon). `allowLargeDrop` = admin kinnitab teadlikult, et suur hulk tooteid kadus tarnija nimekirjast
 * päriselt (muidu jäetakse need ohutuse mõttes saadavaks).
 */
export async function syncLaptopidNowAction(allowLargeDrop: boolean): Promise<ActionResult> {
  return runAdminAction("laptopid.sync", async (admin) => {
    if (!isLaptopidConfigured()) return fail("Laptopid API ei ole seadistatud (LAPTOPID_API_BASE_URL / LAPTOPID_API_KEY).");
    const result = await runLaptopidSyncNow({ trigger: "ADMIN", triggeredBy: admin.email, allowLargeDrop: allowLargeDrop === true });
    if (result.status === "BUSY") return fail("Sync juba käib. Proovi mõne minuti pärast uuesti.");
    await writeAudit(getDb(), admin, {
      action: "laptopid.sync",
      entityType: "CatalogSync",
      entityId: result.runId,
      entityLabel: "Laptopid.ee",
      changes: { status: { from: null, to: result.status }, ...(allowLargeDrop ? { allowLargeDrop: { from: false, to: true } } : {}) },
    });
    if (result.status === "FAILED") {
      refresh();
      return fail(`Sync ebaõnnestus — eelmine kataloog jäi alles. ${result.error}`);
    }
    // Alati (ka muutusteta): nii jõuavad poodi ka väljaspool rakendust (CLI) tehtud muudatused
    updateTag(CATALOG_CACHE_TAG);
    refresh();
    const s = result.stats;
    const summary = `uusi ${s.created}, muutunud ${s.updated}, muutmata ${s.unchanged}, maha võetud ${s.madeUnavailable}, vigaseid ${s.rejected}`;
    return ok(result.snapshotTrusted ? `Sync tehtud: ${summary}.` : `Sync tehtud, aga puuduvaid tooteid maha ei võetud: ${result.trustReason}. (${summary})`);
  });
}

/**
 * Admin → Tarnijad → Tech → "Sync now". Sama kaitse (runAdminAction: päritolu/CSRF + sessioon) ja sama
 * sync-teenus mis ajastatud otspunktil. `allowLargeDrop` = admin kinnitab, et palju seadmeid müüdi/kadus päriselt.
 */
export async function syncTechNowAction(allowLargeDrop: boolean): Promise<ActionResult> {
  return runAdminAction("tech.sync", async (admin) => {
    if (!isTechConfigured()) return fail("Tech hinnakiri ei ole seadistatud (TECH_SHEET_URL).");
    const result = await runTechSyncNow({ trigger: "ADMIN", triggeredBy: admin.email, allowLargeDrop: allowLargeDrop === true });
    if (result.status === "BUSY") return fail("Tech sync juba käib. Proovi mõne minuti pärast uuesti.");
    await writeAudit(getDb(), admin, {
      action: "tech.sync",
      entityType: "CatalogSync",
      entityId: result.runId,
      entityLabel: "Tech",
      changes: { status: { from: null, to: result.status }, ...(allowLargeDrop ? { allowLargeDrop: { from: false, to: true } } : {}) },
    });
    if (result.status === "FAILED") {
      refresh();
      return fail(`Tech sync ebaõnnestus — eelmine kataloog jäi alles. ${result.error}`);
    }
    updateTag(CATALOG_CACHE_TAG);
    refresh();
    const s = result.stats;
    const summary = `müügis seadmeid ${s.validUnits}, pakkumisi ${s.groups} (uusi ${s.created}, muutunud ${s.updated}, maha võetud ${s.madeUnavailable})`;
    return ok(result.snapshotTrusted ? `Tech sync tehtud: ${summary}.` : `Tech sync tehtud, aga puuduvaid seadmeid maha ei võetud: ${result.trustReason}. (${summary})`);
  });
}

"use server";

import { and, asc, eq } from "drizzle-orm";
import { refresh, updateTag } from "next/cache";
import { z } from "zod";
import { BRAND_NAMES, type BrandCode } from "@/domain/catalog/types";
import { titleMatchesModel } from "@/domain/images/icecat-match";
import { createIcecatClientFromEnv } from "@/integrations/icecat/icecat-client";
import { icecatPreviewThumbnails, resolveIcecatImages } from "@/integrations/icecat/icecat-image-resolver";
import { matchModel, productTextForVerification } from "@/integrations/icecat/icecat-matcher";
import { CATALOG_CACHE_TAG } from "@/server/cache-tags";
import { effectiveModel } from "@/server/catalog/db-catalog-mapper";
import { getDb } from "@/server/db/client";
import { icecatMetadata, productIdentifiers, productImages, productModels } from "@/server/db/schema";
import { DbImageRepository, loadModelIdentifiers, normalizeImageOrder } from "@/server/images/db-image-repository";
import { importModelImages, type ModelToImport } from "@/server/images/icecat-image-import";
import { LocalImageStorageAdapter } from "@/server/images/storage/local-image-storage";
import { writeSystemLog } from "@/server/logging/system-log";
import { fail, ok, type ActionResult } from "../action-result";
import { writeAudit } from "../audit";
import { runAdminAction } from "../run-action";

/**
 * Piltide ja Icecati haldus adminis.
 *
 * Piltide FAILID on testversioonis public/media/products all (Git'is). Vercelis failisüsteem pole püsiv,
 * seega piltide allalaadimine ("Värskenda pilte") töötab ainult lokaalses keskkonnas. Vaste otsimine,
 * käsitsi vaste ja piltide järjekord/peitmine töötavad kõikjal (need on andmebaasis).
 */

const uuid = z.uuid();
export const canDownloadImages = async () => !process.env.VERCEL;

async function loadModel(id: string) {
  const [row] = await getDb().select().from(productModels).where(eq(productModels.id, id)).limit(1);
  return row ? effectiveModel(row) : null;
}

function toImportModel(model: typeof productModels.$inferSelect): ModelToImport {
  const brandName = BRAND_NAMES[model.manufacturer as BrandCode] ?? model.manufacturer;
  const modelName = `${model.family.replace(/ P$/, "")} ${model.model}`;
  return { id: model.slug, title: `${brandName} ${modelName}`, brandName, modelName };
}

// ---------------------------------------------------------------------------
// Pildid: põhipilt, järjekord, peitmine
// ---------------------------------------------------------------------------

async function loadImage(imageId: string) {
  const [image] = await getDb().select().from(productImages).where(eq(productImages.id, imageId)).limit(1);
  return image ?? null;
}

export async function setMainImageAction(imageId: string): Promise<ActionResult> {
  return runAdminAction("image.set_main", async (admin) => {
    if (!uuid.safeParse(imageId).success) return fail("Vigane pildi ID");
    const image = await loadImage(imageId);
    if (!image) return fail("Pilti ei leitud");
    if (image.isHidden) return fail("Peidetud pilti ei saa põhipildiks teha. Tee see enne nähtavaks.");
    await getDb().transaction(async (tx) => {
      const rows = await tx.select().from(productImages).where(eq(productImages.productModelId, image.productModelId)).orderBy(asc(productImages.position));
      // Põhipilt liigub esimeseks; teiste järjekord jääb samaks
      const ordered = [image, ...rows.filter((r) => r.id !== image.id)];
      for (const [index, row] of ordered.entries()) await tx.update(productImages).set({ position: index, isMain: row.id === image.id }).where(eq(productImages.id, row.id));
      await writeAudit(tx, admin, { action: "image.set_main", entityType: "ProductImage", entityId: image.id, entityLabel: image.alt, changes: { isMain: { from: image.isMain, to: true } } });
    });
    updateTag(CATALOG_CACHE_TAG);
    return ok("Põhipilt muudetud.");
  });
}

export async function moveImageAction(imageId: string, direction: "up" | "down"): Promise<ActionResult> {
  return runAdminAction("image.move", async (admin) => {
    if (!uuid.safeParse(imageId).success || (direction !== "up" && direction !== "down")) return fail("Vigane päring");
    const image = await loadImage(imageId);
    if (!image) return fail("Pilti ei leitud");
    const result = await getDb().transaction(async (tx) => {
      const rows = await tx.select().from(productImages).where(eq(productImages.productModelId, image.productModelId)).orderBy(asc(productImages.position));
      const index = rows.findIndex((r) => r.id === image.id);
      const target = direction === "up" ? index - 1 : index + 1;
      if (target < 0 || target >= rows.length) return fail("Pilt on juba äärmises asendis");
      [rows[index], rows[target]] = [rows[target], rows[index]];
      for (const [position, row] of rows.entries()) await tx.update(productImages).set({ position }).where(eq(productImages.id, row.id));
      await normalizeImageOrder(tx, image.productModelId);
      await writeAudit(tx, admin, { action: "image.reorder", entityType: "ProductImage", entityId: image.id, entityLabel: image.alt, changes: { position: { from: index, to: target } } });
      return ok("Järjekord muudetud.");
    });
    if (result.ok) updateTag(CATALOG_CACHE_TAG);
    return result;
  });
}

export async function setImageHiddenAction(imageId: string, hidden: boolean): Promise<ActionResult> {
  return runAdminAction("image.hide", async (admin) => {
    if (!uuid.safeParse(imageId).success || typeof hidden !== "boolean") return fail("Vigane päring");
    const image = await loadImage(imageId);
    if (!image) return fail("Pilti ei leitud");
    await getDb().transaction(async (tx) => {
      await tx.update(productImages).set({ isHidden: hidden }).where(eq(productImages.id, imageId));
      await normalizeImageOrder(tx, image.productModelId);
      await writeAudit(tx, admin, { action: hidden ? "image.hide" : "image.unhide", entityType: "ProductImage", entityId: image.id, entityLabel: image.alt, changes: { isHidden: { from: image.isHidden, to: hidden } } });
    });
    updateTag(CATALOG_CACHE_TAG);
    return ok(hidden ? "Pilt peidetud (poes ei kuvata)." : "Pilt on jälle nähtav.");
  });
}

// ---------------------------------------------------------------------------
// Icecat
// ---------------------------------------------------------------------------

function requireIcecat() {
  const client = createIcecatClientFromEnv();
  if (!client) throw new IcecatNotConfigured();
  return client;
}
class IcecatNotConfigured extends Error {}
const ICECAT_MISSING = "Icecat pole selles keskkonnas seadistatud (ICECAT_USERNAME puudub).";

async function refreshMetadataImageCount(modelId: string) {
  const db = getDb();
  const rows = await db.select().from(productImages).where(and(eq(productImages.productModelId, modelId), eq(productImages.isHidden, false)));
  await db.update(icecatMetadata).set({ imageCount: rows.length }).where(eq(icecatMetadata.productModelId, modelId));
}

/**
 * "Otsi uuesti": käib identifikaatorid uuesti läbi. Lokaalselt laeb leitud vaste pildid ka alla;
 * Vercelis uuendab ainult vaste infot (pildid tuleb lokaalselt värskendada).
 * Madala kindlusega vaste (nt ainult nime järgi) EI lähe automaatselt live'i — staatus NEEDS_REVIEW.
 */
export async function retryIcecatLookupAction(modelId: string): Promise<ActionResult> {
  return runAdminAction("icecat.retry", async (admin) => {
    if (!uuid.safeParse(modelId).success) return fail("Vigane mudeli ID");
    const model = await loadModel(modelId);
    if (!model) return fail("Mudelit ei leitud");
    let client;
    try {
      client = requireIcecat();
    } catch {
      return fail(ICECAT_MISSING);
    }
    const db = getDb();
    const ids = await loadModelIdentifiers(db, modelId);
    const importModel = toImportModel(model);
    let status: string;

    if (await canDownloadImages()) {
      const report = await importModelImages(importModel, ids, { icecat: client, storage: new LocalImageStorageAdapter(), repository: new DbImageRepository(db) }, { rematch: true });
      status = report.status;
    } else {
      const outcome = await matchModel({ id: importModel.id, brandName: importModel.brandName, modelName: importModel.modelName }, ids, client);
      const product = "product" in outcome ? outcome.product : null;
      const values = {
        status: outcome.status,
        reason: outcome.reason,
        matchType: "matchType" in outcome ? outcome.matchType : null,
        confidence: "confidence" in outcome ? outcome.confidence : null,
        icecatId: product?.GeneralInfo.IcecatId ?? null,
        icecatTitle: product?.GeneralInfo.Title ?? null,
        matchedBy: "matchedBy" in outcome ? outcome.matchedBy : null,
        titleVerified: "titleVerified" in outcome ? outcome.titleVerified : null,
        error: "error" in outcome ? (outcome.error ?? null) : null,
        checkedAt: new Date(),
      };
      await db.insert(icecatMetadata).values({ productModelId: modelId, ...values }).onConflictDoUpdate({ target: icecatMetadata.productModelId, set: values });
      await refreshMetadataImageCount(modelId);
      status = outcome.status;
    }
    await writeAudit(db, admin, { action: "icecat.retry", entityType: "ProductModel", entityId: modelId, entityLabel: importModel.title, changes: { icecatStatus: { from: null, to: status } } });
    await writeSystemLog({ level: status === "ERROR" ? "WARN" : "INFO", source: "ICECAT", message: `Icecati otsing: ${importModel.title} → ${status}`, details: { admin: admin.email } });
    updateTag(CATALOG_CACHE_TAG);
    return ok(`Icecati otsing tehtud: ${status}.`);
  });
}

/** "Värskenda pilte": laeb kinnitatud vaste pildid uuesti alla (ainult lokaalselt). */
export async function refreshIcecatImagesAction(modelId: string): Promise<ActionResult> {
  return runAdminAction("icecat.refresh_images", async (admin) => {
    if (!uuid.safeParse(modelId).success) return fail("Vigane mudeli ID");
    if (!(await canDownloadImages())) return fail("Piltide allalaadimine töötab ainult lokaalselt (Vercelis pole püsivat pildisalvestust).");
    const model = await loadModel(modelId);
    if (!model) return fail("Mudelit ei leitud");
    let client;
    try {
      client = requireIcecat();
    } catch {
      return fail(ICECAT_MISSING);
    }
    const db = getDb();
    const importModel = toImportModel(model);
    const report = await importModelImages(importModel, await loadModelIdentifiers(db, modelId), { icecat: client, storage: new LocalImageStorageAdapter(), repository: new DbImageRepository(db) }, { force: true });
    await writeAudit(db, admin, { action: "icecat.refresh_images", entityType: "ProductModel", entityId: modelId, entityLabel: importModel.title, changes: { images: { from: null, to: report.imageCount } } });
    await writeSystemLog({ level: report.failed ? "WARN" : "INFO", source: "ICECAT", message: `Pildid värskendatud: ${importModel.title}`, details: { downloaded: report.downloaded, failed: report.failed, status: report.status } });
    updateTag(CATALOG_CACHE_TAG);
    return report.status === "MATCHED" ? ok(`Pildid värskendatud (${report.imageCount} pilti, uusi ${report.downloaded}).`) : fail(`Pilte ei värskendatud: staatus ${report.status}.`);
  });
}

export type IcecatPreviewResult =
  | { ok: true; icecatId: string; title: string; brand: string | null; imageCount: number; titleMatches: boolean; thumbnails: string[]; rejected: boolean }
  | { ok: false; error: string };

/** Käsitsi vaste 1. samm: näita Icecati toote nime ENNE kinnitamist (midagi ei salvestata). */
export async function previewIcecatMatchAction(modelId: string, icecatId: string): Promise<IcecatPreviewResult> {
  const result = await runAdminAction("icecat.preview", async () => ok(""));
  if (!result.ok) return { ok: false, error: result.error };
  if (!uuid.safeParse(modelId).success || !/^\d{1,12}$/.test(icecatId.trim())) return { ok: false, error: "Icecat ID peab olema number." };
  const model = await loadModel(modelId);
  if (!model) return { ok: false, error: "Mudelit ei leitud" };
  let client;
  try {
    client = requireIcecat();
  } catch {
    return { ok: false, error: ICECAT_MISSING };
  }
  const lookup = await client.getProduct({ kind: "ICECAT_ID", icecatId: icecatId.trim() });
  if (lookup.status !== "FOUND") return { ok: false, error: lookup.status === "NOT_FOUND" ? "Icecatist sellise ID-ga toodet ei leitud." : `Icecat: ${lookup.status} (${lookup.message})` };
  const importModel = toImportModel(model);
  return {
    ok: true,
    icecatId: lookup.product.GeneralInfo.IcecatId,
    title: lookup.product.GeneralInfo.Title,
    brand: lookup.product.GeneralInfo.Brand ?? null,
    imageCount: resolveIcecatImages(lookup.product).length,
    titleMatches: titleMatchesModel(productTextForVerification(lookup.product), importModel.brandName, importModel.modelName),
    thumbnails: icecatPreviewThumbnails(lookup.product, 6),
    rejected: (await loadModelIdentifiers(getDb(), modelId)).rejectedIcecatIds?.includes(lookup.product.GeneralInfo.IcecatId) ?? false,
  };
}

/** Käsitsi vaste 2. samm: admin kinnitas Icecati toote. Kõrgeim prioriteet järgmistel otsingutel. */
export async function confirmIcecatMatchAction(modelId: string, icecatId: string, icecatTitle: string): Promise<ActionResult> {
  return runAdminAction("icecat.confirm", async (admin) => {
    if (!uuid.safeParse(modelId).success || !/^\d{1,12}$/.test(icecatId)) return fail("Vigane päring");
    const model = await loadModel(modelId);
    if (!model) return fail("Mudelit ei leitud");
    const title = String(icecatTitle).slice(0, 300);
    await getDb().transaction(async (tx) => {
      await tx.delete(productIdentifiers).where(and(eq(productIdentifiers.productModelId, modelId), eq(productIdentifiers.kind, "CONFIRMED_ICECAT_ID")));
      await tx.delete(productIdentifiers).where(and(eq(productIdentifiers.productModelId, modelId), eq(productIdentifiers.kind, "REJECTED_ICECAT_ID"), eq(productIdentifiers.value, icecatId)));
      await tx.insert(productIdentifiers).values({ productModelId: modelId, kind: "CONFIRMED_ICECAT_ID", value: icecatId, source: "ADMIN" });
      const [previous] = await tx.select().from(icecatMetadata).where(eq(icecatMetadata.productModelId, modelId));
      const values = { status: "MATCHED" as const, reason: null, matchType: "MANUAL", confidence: 1, icecatId, icecatTitle: title, matchedBy: `Admin ${admin.email}`, titleVerified: true, error: null, checkedAt: new Date() };
      await tx.insert(icecatMetadata).values({ productModelId: modelId, ...values }).onConflictDoUpdate({ target: icecatMetadata.productModelId, set: values });
      await writeAudit(tx, admin, {
        action: "icecat.manual_match",
        entityType: "ProductModel",
        entityId: modelId,
        entityLabel: `${model.family} ${model.model}`,
        changes: { icecatId: { from: previous?.icecatId ?? null, to: icecatId }, icecatStatus: { from: previous?.status ?? null, to: "MATCHED" } },
      });
    });
    updateTag(CATALOG_CACHE_TAG);
    refresh();
    // Ei teeskle importi: pildid tulevad alles allalaadimisega (Vercelis püsivat pildisalvestust pole)
    return ok((await canDownloadImages()) ? "Vaste kinnitatud, pildid pole veel alla laaditud — vajuta „Laadi pildid alla“." : "Vaste kinnitatud, pildid pole veel alla laaditud (allalaadimine töötab ainult lokaalselt — püsiv pildisalvestus puudub).");
  });
}

/**
 * Käsitsi vaste eemaldamine. Selle vastega seotud Icecati pildid PEIDETAKSE (mitte ei kustutata) —
 * vale pilt poes on halvem kui placeholder. Admin saab need vajadusel uuesti nähtavaks teha.
 */
export async function clearManualMatchAction(modelId: string): Promise<ActionResult> {
  return runAdminAction("icecat.clear_manual", async (admin) => {
    if (!uuid.safeParse(modelId).success) return fail("Vigane mudeli ID");
    const model = await loadModel(modelId);
    if (!model) return fail("Mudelit ei leitud");
    const result = await getDb().transaction(async (tx) => {
      const removed = await tx
        .delete(productIdentifiers)
        .where(and(eq(productIdentifiers.productModelId, modelId), eq(productIdentifiers.kind, "CONFIRMED_ICECAT_ID")))
        .returning({ value: productIdentifiers.value });
      if (!removed.length) return fail("Mudelil pole käsitsi kinnitatud vastet.");
      const [meta] = await tx.select().from(icecatMetadata).where(eq(icecatMetadata.productModelId, modelId));
      const hidden = await tx
        .update(productImages)
        .set({ isHidden: true })
        .where(and(eq(productImages.productModelId, modelId), eq(productImages.source, "ICECAT"), eq(productImages.isHidden, false)))
        .returning({ id: productImages.id });
      if (meta) await tx.update(icecatMetadata).set({ status: "NEEDS_REVIEW", reason: null, matchType: null, confidence: null, matchedBy: null, imageCount: 0, checkedAt: new Date() }).where(eq(icecatMetadata.productModelId, modelId));
      await normalizeImageOrder(tx, modelId);
      await writeAudit(tx, admin, {
        action: "icecat.manual_match_cleared",
        entityType: "ProductModel",
        entityId: modelId,
        entityLabel: `${model.family} ${model.model}`,
        changes: { confirmedIcecatId: { from: removed[0].value, to: null }, hiddenImages: { from: 0, to: hidden.length } },
      });
      return ok(`Käsitsi vaste eemaldatud; ${hidden.length} pilti peideti. Otsi vastet uuesti.`);
    });
    if (result.ok) updateTag(CATALOG_CACHE_TAG);
    return result;
  });
}

const icecatIdSchema = z.string().trim().regex(/^\d{1,12}$/);

/**
 * "Lükka tagasi": konkreetne Icecati toode EI ole see mudel. Salvestab REJECTED_ICECAT_ID (matchModel ja
 * nimepõhine otsing jätavad selle edaspidi vahele), staatus → REJECTED. Kui see toode oli mudeli vaste, selle
 * pildid PEIDETAKSE (mitte ei kustutata). Teist Icecat ID-d saab käsitsi sisestada; "Taasta kandidaat" pöörab tagasi.
 */
export async function rejectIcecatCandidateAction(modelId: string, icecatId: string): Promise<ActionResult> {
  return runAdminAction("icecat.reject", async (admin) => {
    const id = icecatIdSchema.safeParse(icecatId);
    if (!uuid.safeParse(modelId).success || !id.success) return fail("Vigane päring");
    const model = await loadModel(modelId);
    if (!model) return fail("Mudelit ei leitud");
    const result = await getDb().transaction(async (tx) => {
      await tx.insert(productIdentifiers).values({ productModelId: modelId, kind: "REJECTED_ICECAT_ID", value: id.data, source: "ADMIN" }).onConflictDoNothing();
      const removedConfirmed = await tx
        .delete(productIdentifiers)
        .where(and(eq(productIdentifiers.productModelId, modelId), eq(productIdentifiers.kind, "CONFIRMED_ICECAT_ID"), eq(productIdentifiers.value, id.data)))
        .returning({ id: productIdentifiers.id });
      const [meta] = await tx.select().from(icecatMetadata).where(eq(icecatMetadata.productModelId, modelId));
      const wasMatch = meta?.icecatId === id.data && meta.status === "MATCHED";
      // Selle vaste pildid peitu (vale pilt poes on halvem kui placeholder); muude allikate pilte ei puudutata
      const hidden = wasMatch
        ? await tx
            .update(productImages)
            .set({ isHidden: true })
            .where(and(eq(productImages.productModelId, modelId), eq(productImages.source, "ICECAT"), eq(productImages.isHidden, false)))
            .returning({ id: productImages.id })
        : [];
      const values = { status: "REJECTED" as const, reason: "ADMIN_REJECTED", matchType: null, confidence: null, icecatId: id.data, icecatTitle: meta?.icecatId === id.data ? meta.icecatTitle : null, matchedBy: `Admin ${admin.email}`, imageCount: 0, checkedAt: new Date() };
      await tx.insert(icecatMetadata).values({ productModelId: modelId, ...values }).onConflictDoUpdate({ target: icecatMetadata.productModelId, set: values });
      if (hidden.length) await normalizeImageOrder(tx, modelId);
      await writeAudit(tx, admin, {
        action: "icecat.reject",
        entityType: "ProductModel",
        entityId: modelId,
        entityLabel: `${model.family} ${model.model}`,
        changes: {
          rejectedIcecatId: { from: null, to: id.data },
          icecatStatus: { from: meta?.status ?? null, to: "REJECTED" },
          ...(removedConfirmed.length ? { confirmedIcecatId: { from: id.data, to: null } } : {}),
          ...(hidden.length ? { hiddenImages: { from: 0, to: hidden.length } } : {}),
        },
      });
      return ok(`Icecat ${id.data} lükati tagasi${hidden.length ? `; ${hidden.length} pilti peideti` : ""}. Seda kandidaati enam ei pakuta.`);
    });
    if (result.ok) {
      updateTag(CATALOG_CACHE_TAG);
      refresh();
    }
    return result;
  });
}

/** "Taasta kandidaat": eemaldab tagasilükkamise (üks klikk, seega kinnitusdialoogi pole). Peidetud pilte ei näidata automaatselt. */
export async function restoreIcecatCandidateAction(modelId: string, icecatId: string): Promise<ActionResult> {
  return runAdminAction("icecat.reject_undone", async (admin) => {
    const id = icecatIdSchema.safeParse(icecatId);
    if (!uuid.safeParse(modelId).success || !id.success) return fail("Vigane päring");
    const model = await loadModel(modelId);
    if (!model) return fail("Mudelit ei leitud");
    const result = await getDb().transaction(async (tx) => {
      const removed = await tx
        .delete(productIdentifiers)
        .where(and(eq(productIdentifiers.productModelId, modelId), eq(productIdentifiers.kind, "REJECTED_ICECAT_ID"), eq(productIdentifiers.value, id.data)))
        .returning({ id: productIdentifiers.id });
      if (!removed.length) return ok("Seda kandidaati polnud tagasi lükatud.");
      const [meta] = await tx.select().from(icecatMetadata).where(eq(icecatMetadata.productModelId, modelId));
      if (meta?.status === "REJECTED" && meta.icecatId === id.data) {
        await tx.update(icecatMetadata).set({ status: "NEEDS_REVIEW", reason: null, checkedAt: new Date() }).where(eq(icecatMetadata.productModelId, modelId));
      }
      await writeAudit(tx, admin, {
        action: "icecat.reject_undone",
        entityType: "ProductModel",
        entityId: modelId,
        entityLabel: `${model.family} ${model.model}`,
        changes: { rejectedIcecatId: { from: id.data, to: null }, ...(meta?.status === "REJECTED" && meta.icecatId === id.data ? { icecatStatus: { from: "REJECTED", to: "NEEDS_REVIEW" } } : {}) },
      });
      return ok(`Icecat ${id.data} on jälle kandidaat (ülevaatusel).`);
    });
    if (result.ok) {
      updateTag(CATALOG_CACHE_TAG);
      refresh();
    }
    return result;
  });
}

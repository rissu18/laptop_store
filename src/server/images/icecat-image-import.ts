import { type IcecatMatchRecord, type IcecatMatchStatus, type IcecatMatchType, titleMatchesModel } from "@/domain/images/icecat-match";
import {
  IMAGE_VARIANTS,
  buildAltText,
  buildImageFileName,
  type ImageVariant,
  type ProductImageRecord,
} from "@/domain/images/product-image";
import { resolveIcecatImages, selectSource, type ResolvedIcecatImage } from "@/integrations/icecat/icecat-image-resolver";
import {
  matchModel,
  productTextForVerification,
  type IcecatLookup,
  type MatchAttempt,
  type ModelIdentifiers,
} from "@/integrations/icecat/icecat-matcher";
import type { IcecatProduct } from "@/integrations/icecat/icecat-types";
import { mapWithConcurrency } from "@/server/concurrency/map-with-concurrency";
import { fetchWithRetry } from "@/server/http/fetch-with-retry";
import { createLogger } from "@/server/logging/logger";
import type { ProductImageRepository } from "./image-repository";
import { MAX_SOURCE_BYTES, inspectImage, renderVariant } from "./image-processor";
import type { ImageStorageAdapter } from "./storage/image-storage";

/**
 * Icecati piltide import ühe mudeli kohta:
 *
 *   ProductModel → Icecat matcher → Icecati toode → põhipilt + galerii → sobivad pildid
 *   → allalaadimine → kontroll → thumbnail/medium/large → meie salvestusruum → ProductImage kirjed
 *
 * Frontend kasutab ainult meie salvestusruumi URL-e (Icecati pilte ei hotlinkita).
 */

const log = createLogger("icecat-images");

export interface ModelToImport {
  /** Mudeli slug (ProductModel ID), nt "lenovo-thinkpad-t14-gen-3" */
  id: string;
  /** "Lenovo ThinkPad T14 Gen 3" */
  title: string;
  brandName: string;
  /** "ThinkPad T14 Gen 3" */
  modelName: string;
}

export interface DownloadedFile {
  data: Buffer;
  contentType: string | null;
}

export interface ImportDependencies {
  icecat: IcecatLookup & { assetHeaders(): Record<string, string> };
  storage: ImageStorageAdapter;
  repository: ProductImageRepository;
  download?: (url: string, headers: Record<string, string>) => Promise<DownloadedFile>;
  now?: () => Date;
}

export interface ImportOptions {
  /** Lae kõik pildid uuesti alla ka siis, kui allikas pole muutunud ("Refresh images") */
  force?: boolean;
  /** Otsi vastet uuesti, isegi kui kinnitatud vaste on olemas ("Retry Icecat lookup") */
  rematch?: boolean;
  /** Mitu pilti ühe mudeli kohta korraga alla laetakse */
  imageConcurrency?: number;
}

export interface ModelImportReport {
  modelId: string;
  title: string;
  status: IcecatMatchStatus;
  matchType: IcecatMatchType | null;
  confidence: number | null;
  icecatId: string | null;
  icecatTitle: string | null;
  matchedBy: string | null;
  hasMainImage: boolean;
  /** Galeriipildid lisaks põhipildile */
  galleryCount: number;
  downloaded: number;
  unchanged: number;
  failed: number;
  removed: number;
  errors: string[];
  attempts: MatchAttempt[];
}

export async function downloadImage(url: string, headers: Record<string, string>): Promise<DownloadedFile> {
  const response = await fetchWithRetry(url, { headers }, { timeoutMs: 30_000, maxRetries: 2, baseDelayMs: 1000 });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const length = Number(response.headers.get("content-length"));
  if (Number.isFinite(length) && length > MAX_SOURCE_BYTES) throw new Error(`Fail on liiga suur (${length} baiti)`);
  return { data: Buffer.from(await response.arrayBuffer()), contentType: response.headers.get("content-type") };
}

/** Laeb ühe pildi kolm varianti, töötleb ja salvestab. Sama allika-URL laaditakse ainult korra. */
async function storeImage(
  model: ModelToImport,
  image: ResolvedIcecatImage,
  deps: Required<Pick<ImportDependencies, "download">> & ImportDependencies,
  now: Date,
  reservedKeys: Set<string>,
): Promise<ProductImageRecord> {
  const cache = new Map<string, Promise<DownloadedFile>>();
  const stored: Partial<Record<ImageVariant, { url: string; key: string; width: number; height: number }>> = {};
  let largeSourceUrl = "";
  // Kui tavanimi on teise (alles jääva) pildi kasutuses, lisatakse nimele Icecati pildi ID
  const collides = IMAGE_VARIANTS.some((v) => reservedKeys.has(`${model.id}/${buildImageFileName(model.id, image.position, v)}`));
  const uniqueId = collides ? image.sourceId : undefined;

  for (const variant of IMAGE_VARIANTS) {
    const source = selectSource(image.candidates[variant], variant);
    if (!source) throw new Error(`Variandi "${variant}" allikas puudub`);
    if (variant === "large") largeSourceUrl = source.url;

    if (!cache.has(source.url)) cache.set(source.url, deps.download(source.url, deps.icecat.assetHeaders()));
    const file = await cache.get(source.url)!;
    const inspected = await inspectImage(file.data, file.contentType);
    const rendered = await renderVariant(file.data, variant, inspected.hasAlpha);
    const saved = await deps.storage.saveImage({
      productModelId: model.id,
      variant,
      fileName: buildImageFileName(model.id, image.position, variant, uniqueId),
      data: rendered.data,
      contentType: rendered.contentType,
    });
    stored[variant] = { url: saved.url, key: saved.key, width: rendered.width, height: rendered.height };
  }

  return {
    id: `${model.id}-icecat-${image.sourceId}`,
    productModelId: model.id,
    source: "ICECAT",
    sourceId: image.sourceId,
    type: "MODEL_GENERIC",
    position: image.position,
    isMain: image.isMain,
    thumbnailUrl: stored.thumbnail!.url,
    mediumUrl: stored.medium!.url,
    largeUrl: stored.large!.url,
    width: stored.large!.width,
    height: stored.large!.height,
    alt: buildAltText(model.title, image.position),
    originalSourceUrl: largeSourceUrl,
    sourceUpdatedAt: image.updatedAt,
    downloadedAt: now.toISOString(),
    storageKeys: [stored.thumbnail!.key, stored.medium!.key, stored.large!.key],
  };
}

function matchRecord(
  model: ModelToImport,
  status: IcecatMatchStatus,
  now: Date,
  fields: Partial<IcecatMatchRecord> = {},
): IcecatMatchRecord {
  return {
    productModelId: model.id,
    status,
    matchType: null,
    confidence: null,
    icecatId: null,
    icecatTitle: null,
    matchedBy: null,
    titleVerified: null,
    imageCount: 0,
    checkedAt: now.toISOString(),
    error: null,
    ...fields,
  };
}

async function removeImages(records: ProductImageRecord[], keepKeys: Set<string>, storage: ImageStorageAdapter): Promise<number> {
  let removed = 0;
  for (const record of records) {
    for (const key of record.storageKeys) {
      if (keepKeys.has(key)) continue; // fail on uue kirje poolt kasutusel (sama failinimi)
      await storage.deleteImage(key).catch((error) => log.warn("Faili kustutamine ebaõnnestus", { key, error: String(error) }));
    }
    removed++;
  }
  return removed;
}

/**
 * Leiab Icecati toote: kui mudelil on juba kinnitatud vaste, küsitakse otse Icecat ID järgi
 * (üks päring); muidu käib läbi kogu identifikaatorite järjekorra.
 */
async function findProduct(model: ModelToImport, ids: ModelIdentifiers, previous: IcecatMatchRecord | null, deps: ImportDependencies, rematch: boolean) {
  const reusable =
    !rematch && previous?.status === "MATCHED" && previous.icecatId && previous.matchType && !ids.confirmedIcecatId;
  if (reusable) {
    const result = await deps.icecat.getProduct({ kind: "ICECAT_ID", icecatId: previous.icecatId! });
    if (result.status === "FOUND") {
      const info = result.product.GeneralInfo;
      const verified = titleMatchesModel(productTextForVerification(result.product), model.brandName, model.modelName);
      if (verified) {
        return {
          status: "MATCHED" as const,
          matchType: previous.matchType!,
          confidence: previous.confidence ?? 1,
          product: result.product,
          matchedBy: previous.matchedBy ?? `Icecat ID ${previous.icecatId}`,
          titleVerified: true,
          attempts: [{ identifier: `Icecat ID ${previous.icecatId}`, result: "FOUND" as const, message: info.Title }],
        };
      }
    }
  }
  return matchModel({ id: model.id, brandName: model.brandName, modelName: model.modelName }, ids, deps.icecat);
}

export async function importModelImages(
  model: ModelToImport,
  ids: ModelIdentifiers,
  deps: ImportDependencies,
  options: ImportOptions = {},
): Promise<ModelImportReport> {
  const now = (deps.now ?? (() => new Date()))();
  const fullDeps = { ...deps, download: deps.download ?? downloadImage };
  const previous = await deps.repository.getMatch(model.id);
  const existing = await deps.repository.listImages(model.id);

  const report: ModelImportReport = {
    modelId: model.id,
    title: model.title,
    status: "NOT_FOUND",
    matchType: null,
    confidence: null,
    icecatId: null,
    icecatTitle: null,
    matchedBy: null,
    hasMainImage: false,
    galleryCount: 0,
    downloaded: 0,
    unchanged: 0,
    failed: 0,
    removed: 0,
    errors: [],
    attempts: [],
  };

  // Admin on vaste tagasi lükanud ega ole uut kinnitanud → ei tee midagi
  if (previous?.status === "REJECTED" && !ids.confirmedIcecatId && !options.rematch) {
    report.status = "REJECTED";
    return report;
  }

  const outcome = await findProduct(model, ids, previous, deps, Boolean(options.rematch));
  report.attempts = outcome.attempts;

  if (outcome.status !== "MATCHED") {
    const onlyErrors = outcome.attempts.length > 0 && outcome.attempts.every((a) => a.result === "ERROR");
    if (onlyErrors) {
      // Ajutine viga (nt Icecat maas): olemasolevaid pilte EI eemaldata
      report.status = previous?.status ?? "NOT_FOUND";
      report.errors.push("Icecat ei vastanud — olemasolevad pildid jäeti alles");
      await deps.repository.saveMatch({ ...(previous ?? matchRecord(model, "NOT_FOUND", now)), checkedAt: now.toISOString(), error: report.errors[0] });
      return report;
    }

    // Kindlat vastet pole → pilte live'is ei näidata (vale pilt on hullem kui placeholder)
    report.removed = await removeImages(existing, new Set(), deps.storage);
    await deps.repository.replaceImages(model.id, []);
    report.status = outcome.status;
    if (outcome.status === "NEEDS_REVIEW") {
      Object.assign(report, {
        matchType: outcome.matchType,
        confidence: outcome.confidence,
        icecatId: outcome.product.GeneralInfo.IcecatId,
        icecatTitle: outcome.product.GeneralInfo.Title,
        matchedBy: outcome.matchedBy,
      });
    }
    await deps.repository.saveMatch(
      matchRecord(model, outcome.status, now, {
        matchType: report.matchType,
        confidence: report.confidence,
        icecatId: report.icecatId,
        icecatTitle: report.icecatTitle,
        matchedBy: report.matchedBy,
        titleVerified: outcome.status === "NEEDS_REVIEW" ? outcome.titleVerified : null,
        error: "error" in outcome ? outcome.error : null,
      }),
    );
    return report;
  }

  Object.assign(report, {
    status: "MATCHED",
    matchType: outcome.matchType,
    confidence: outcome.confidence,
    icecatId: outcome.product.GeneralInfo.IcecatId,
    icecatTitle: outcome.product.GeneralInfo.Title,
    matchedBy: outcome.matchedBy,
  });

  const records = await syncImages(model, outcome.product, existing, fullDeps, options, now, report);

  const status: IcecatMatchStatus = records.length === 0 && report.failed > 0 ? "DOWNLOAD_FAILED" : "MATCHED";
  report.status = status;
  report.hasMainImage = records.some((r) => r.isMain);
  report.galleryCount = records.filter((r) => !r.isMain).length;

  await deps.repository.saveMatch(
    matchRecord(model, status, now, {
      matchType: outcome.matchType,
      confidence: outcome.confidence,
      icecatId: report.icecatId,
      icecatTitle: report.icecatTitle,
      matchedBy: outcome.matchedBy,
      titleVerified: outcome.titleVerified,
      imageCount: records.length,
      error: report.errors.length ? report.errors.join("; ").slice(0, 500) : null,
    }),
  );
  return report;
}

/** Uuendab ainult muutunud pilte; muutumata pildid jäävad puutumata. */
async function syncImages(
  model: ModelToImport,
  product: IcecatProduct,
  existing: ProductImageRecord[],
  deps: Required<Pick<ImportDependencies, "download">> & ImportDependencies,
  options: ImportOptions,
  now: Date,
  report: ModelImportReport,
): Promise<ProductImageRecord[]> {
  const resolved = resolveIcecatImages(product);
  const existingBySource = new Map(existing.filter((r) => r.source === "ICECAT").map((r) => [r.sourceId, r]));

  const results = await mapWithConcurrency(resolved, options.imageConcurrency ?? 2, async (image) => {
    const previous = existingBySource.get(image.sourceId);
    // Sama Icecati pilt (ID) ja sama muutmise aeg → faili ei laadita uuesti alla
    const unchanged = !options.force && previous && previous.sourceUpdatedAt === image.updatedAt;
    if (unchanged) {
      report.unchanged++;
      return previous;
    }
    // Teiste piltide failid on kaitstud — uus pilt ei tohi neid üle kirjutada
    const reservedKeys = new Set(existing.filter((r) => r.sourceId !== image.sourceId).flatMap((r) => r.storageKeys));
    try {
      const record = await storeImage(model, image, deps, now, reservedKeys);
      report.downloaded++;
      return record;
    } catch (error) {
      report.failed++;
      const message = `Pilt ${image.sourceId}: ${error instanceof Error ? error.message : String(error)}`;
      report.errors.push(message);
      log.warn("Pildi import ebaõnnestus", { model: model.id, sourceId: image.sourceId, error: message });
      // Kui vana versioon on olemas, jääb see alles
      return previous ?? null;
    }
  });

  // Järjekord jääb Icecati galerii järjekorraks; ebaõnnestunud pildid jäävad vahelt välja
  const records = results
    .filter((r): r is ProductImageRecord => r !== null)
    .map((r, index) => ({ ...r, position: index, isMain: index === 0, alt: buildAltText(model.title, index) }));
  const keepKeys = new Set(records.flatMap((r) => r.storageKeys));
  const keptIds = new Set(records.map((r) => r.id));
  report.removed = await removeImages(
    existing.filter((r) => !keptIds.has(r.id)),
    keepKeys,
    deps.storage,
  );

  await deps.repository.replaceImages(model.id, records);
  return records;
}

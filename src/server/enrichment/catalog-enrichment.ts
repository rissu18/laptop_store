import { and, eq, inArray, sql } from "drizzle-orm";
import { buildBenchmarkIndex, cpuBenchmarkKey, effectivePerformance, gpuBenchmarkKey, parseBenchmark, validCpuMaxMhz, type BenchmarkIndexEntry } from "@/domain/catalog/benchmarks";
import { parseCpuInfo } from "@/domain/catalog/cpu-filter";
import type { ListingDetails } from "@/domain/catalog/listing-details";
import {
  buildIntegratedGpuIndex,
  cpuGpuKey,
  type EnrichedValue,
  type ListingEnrichment,
  type ModelEnrichment,
  type ModelImageEnrichment,
} from "@/domain/catalog/enrichment";
import { findModelMatch, type MatchableModel } from "@/domain/catalog/model-match";
import { applyOverrides, listingOverridableFields, MODEL_OVERRIDABLE_FIELDS } from "@/domain/catalog/overrides";
import { BRAND_NAMES, type BrandCode } from "@/domain/catalog/types";
import type { ModelIdentifiers } from "@/integrations/icecat/icecat-matcher";
import { stableStringify } from "@/integrations/supplier/stable-stringify";
import type { Database } from "@/server/db/client";
import { listingImages, productIdentifiers, productImages, productModels, supplierListings } from "@/server/db/schema";
import { loadModelIdentifiers, normalizeImageOrder } from "@/server/images/db-image-repository";
import { importModelImages, type ImportDependencies, type ModelImportReport, type ModelToImport } from "@/server/images/icecat-image-import";

/**
 * Kataloogi rikastus — LOCAL-FIRST (vt domain/catalog/enrichment.ts):
 *
 *   PILDID (mudeli tasemel, product_images):
 *     1. mudelil on juba nähtavaid pilte (Icecat / varasem Laptopid / admin)        → ei tehta midagi (LOCAL)
 *     2. sama mudeli Laptopid.ee pakkumistel on fotod                               → seotakse mudeliga (LAPTOPID)
 *        või kindel vaste teise Laptopid.ee mudeliga (domain/catalog/model-match.ts)
 *        ebakindel vaste → REVIEW (pilte EI lisata), vastet pole → UNRESOLVED
 *     3. ainult UNRESOLVED/REVIEW + poes müügis + identifikaator (GTIN/MPN) olemas → Icecat (`--icecat`, ainult lokaalselt:
 *        pildid laaditakse alla public/media/products alla ja commit'itakse; Vercelis pole püsivat salvestust)
 *   TEHNILISED ANDMED (supplier_listings.enrichment, ainult tühjad väljad, ei kirjuta tarnija veerge):
 *     - GPU: tarnija ütles "Integrated" → integreeritud GPU nimi sama CPU järgi (Laptopid.ee → muud meie pakkumised)
 *     - resolutsioon: tarnija andis ainult nime ("Retina") → sama mudeli + ekraani pakkumiste üksmeelne resolutsioon
 *     - CPU põlvkond: tuletab tarnija sync parseCpuInfo'ga (siin ainult aruanne)
 *
 * Idempotentne (sama sisend → muudatusi 0), admini parandusi (manual_overrides) ja peidetud pilte ei puututa,
 * pood loeb tulemust ainult andmebaasist.
 */

const MAX_GALLERY = 12;
const MIN_IMAGE_WIDTH = 500;

export interface EnrichmentOptions {
  images?: boolean;
  specs?: boolean;
  /** Icecat (viimane allikas) — vajab `icecat` sõltuvusi ja lokaalset pildisalvestust */
  icecat?: ImportDependencies | null;
  dryRun?: boolean;
  now?: Date;
  log?: (message: string) => void;
}

export interface ImageExample {
  model: string;
  source: string;
  matchedModel: string | null;
  matchedBy: string | null;
  images: number;
}

export interface EnrichmentReport {
  dryRun: boolean;
  images: {
    models: number;
    before: { withImages: number; withoutImages: number };
    after: { withImages: number; withoutImages: number };
    status: Record<string, number>;
    linkedLaptopidSameModel: number;
    linkedLaptopidMatched: number;
    review: number;
    unresolved: number;
    icecatAttempted: number;
    icecatMatched: number;
    icecatSkippedNoIdentifiers: number;
    examples: ImageExample[];
    reviewExamples: { model: string; candidates: string[]; matchedBy: string }[];
    icecatResults: { model: string; status: string; matchedBy: string | null; images: number; title: string | null }[];
  } | null;
  specs: {
    listings: number;
    gpuEnriched: { laptopid: number; local: number };
    gpuStillGeneric: number;
    resolutionEnriched: number;
    changedListings: number;
    cpuGenerationMissing: number;
    cpuGenerationParsable: number;
    examples: { sku: string; cpu: string; gpu: string; source: string }[];
    performance: PerformanceReport;
  } | null;
}

export interface PerformanceReport {
  /** Laptopid.ee andmetest (unikaalsed täpsed võtmed): CPU / GPU / maks. sagedus */
  sourceKeys: { cpuBenchmark: number; gpuBenchmark: number; cpuMaxMhz: number };
  /** Konfliktid: sama võti, eri väärtused → ei kasutata */
  conflicts: { kind: string; key: string; values: number[]; labels: string[] }[];
  /** Poes müügis pakkumised: väärtus tarnijalt endalt / täpse vastega Laptopid.ee-st / puudub */
  onSale: Record<"cpuBenchmark" | "gpuBenchmark" | "cpuMaxMhz", { direct: number; matched: number; missing: number }>;
  /** Poes müügis unikaalsed CPU/GPU nimed: väärtusega / ilma */
  uniqueOnSale: { cpus: number; cpusWithBenchmark: number; cpusWithMaxMhz: number; gpus: number; gpusWithBenchmark: number };
  unresolvedCpus: string[];
  unresolvedGpus: string[];
  examples: { cpu: { name: string; value: number; source: string }[]; gpu: { name: string; value: number; source: string }[]; mhz: { name: string; value: number; source: string }[] };
}

type ModelRow = Pick<typeof productModels.$inferSelect, "id" | "slug" | "manufacturer" | "family" | "model" | "screenSizeIn" | "manualOverrides" | "enrichment">;

type ListingRow = {
  id: string;
  productModelId: string;
  supplier: string;
  sku: string;
  status: string;
  available: boolean | null;
  qualityHold: string | null;
  priceSource: "PRICING" | "SUPPLIER";
  manualOverrides: Record<string, unknown>;
  cpu: string | null;
  cpuGeneration: string | null;
  gpu: string | null;
  gpuDedicated: boolean | null;
  resolution: string | null;
  resolutionLabel: string | null;
  screenSizeIn: number | null;
  enrichment: ListingEnrichment | null;
  details: ListingDetails | null;
  productName: string | null;
  mpn: string | null;
  ean: string | null;
  lastSeenAt: Date | null;
};

async function loadListings(db: Database): Promise<ListingRow[]> {
  return db
    .select({
      id: supplierListings.id,
      productModelId: supplierListings.productModelId,
      supplier: supplierListings.supplier,
      sku: supplierListings.sku,
      status: supplierListings.status,
      available: supplierListings.available,
      qualityHold: supplierListings.qualityHold,
      priceSource: supplierListings.priceSource,
      manualOverrides: supplierListings.manualOverrides,
      cpu: supplierListings.cpu,
      cpuGeneration: supplierListings.cpuGeneration,
      gpu: supplierListings.gpu,
      gpuDedicated: supplierListings.gpuDedicated,
      resolution: supplierListings.resolution,
      resolutionLabel: supplierListings.resolutionLabel,
      screenSizeIn: supplierListings.screenSizeIn,
      enrichment: supplierListings.enrichment,
      details: supplierListings.details,
      productName: sql<string | null>`${supplierListings.rawData}->'foxway'->>'productName'`,
      mpn: sql<string | null>`${supplierListings.rawData}->'foxway'->>'mpn'`,
      ean: sql<string | null>`${supplierListings.rawData}->'foxway'->>'ean'`,
      lastSeenAt: supplierListings.lastSeenAt,
    })
    .from(supplierListings);
}

const effective = (l: ListingRow) => applyOverrides(l, l.manualOverrides, listingOverridableFields(l.priceSource));
/** Poes müügis (sama loogika mis catalog-queries: ACTIVE, saadaval, kvaliteedi kinnipidamiseta) */
const onSale = (l: ListingRow) => l.status === "ACTIVE" && l.available !== false && !effective(l).qualityHold;

// ---- Pildid -----------------------------------------------------------------------------------------------------

type GalleryImage = typeof listingImages.$inferSelect;

function bestGallery(listings: ListingRow[], imagesByListing: Map<string, GalleryImage[]>): { listing: ListingRow; images: GalleryImage[] } | null {
  const candidates = listings
    .filter((l) => l.supplier === "laptopid")
    .map((listing) => {
      const seen = new Set<string>();
      const images = (imagesByListing.get(listing.id) ?? [])
        .filter((img) => !img.isHidden && (img.width ?? 0) >= MIN_IMAGE_WIDTH && !seen.has(img.largeUrl) && seen.add(img.largeUrl))
        .sort((a, b) => a.position - b.position)
        .slice(0, MAX_GALLERY);
      return { listing, images };
    })
    .filter((c) => c.images.length > 0);
  candidates.sort(
    (a, b) =>
      Number(b.listing.available !== false) - Number(a.listing.available !== false) ||
      b.images.length - a.images.length ||
      (b.listing.lastSeenAt?.getTime() ?? 0) - (a.listing.lastSeenAt?.getTime() ?? 0),
  );
  return candidates[0] ?? null;
}

function modelTitle(m: ModelRow): string {
  const brand = BRAND_NAMES[m.manufacturer as BrandCode] ?? m.manufacturer;
  return `${brand} ${m.family === m.model || m.model.startsWith(m.family) ? m.model : `${m.family} ${m.model}`}`;
}

async function enrichImages(db: Database, models: ModelRow[], listings: ListingRow[], options: EnrichmentOptions, now: Date): Promise<NonNullable<EnrichmentReport["images"]>> {
  const log = options.log ?? (() => {});
  const imageRows = await db.select({ productModelId: productImages.productModelId, source: productImages.source, isHidden: productImages.isHidden }).from(productImages);
  const listingImageRows = await db.select().from(listingImages);

  const imagesByListing = new Map<string, GalleryImage[]>();
  for (const img of listingImageRows) imagesByListing.set(img.supplierListingId, [...(imagesByListing.get(img.supplierListingId) ?? []), img]);
  const listingsByModel = new Map<string, ListingRow[]>();
  for (const l of listings) listingsByModel.set(l.productModelId, [...(listingsByModel.get(l.productModelId) ?? []), l]);
  const productImagesByModel = new Map<string, { source: string; isHidden: boolean }[]>();
  for (const r of imageRows) productImagesByModel.set(r.productModelId, [...(productImagesByModel.get(r.productModelId) ?? []), r]);

  const effModels = models.map((m) => applyOverrides(m, m.manualOverrides, MODEL_OVERRIDABLE_FIELDS));
  const matchable = (m: ModelRow): MatchableModel => {
    const own = listingsByModel.get(m.id) ?? [];
    return {
      id: m.id,
      slug: m.slug,
      manufacturer: m.manufacturer,
      family: m.family,
      model: m.model,
      screenSizeIn: m.screenSizeIn,
      rawNames: [...new Set(own.map((l) => l.productName).filter((n): n is string => Boolean(n)))],
      cpus: [...new Set(own.map((l) => l.cpu).filter((c): c is string => Boolean(c)))],
    };
  };
  // Laptopid.ee mudelid, millel on fotosid (ka müüdud pakkumistelt — pildid jäävad andmebaasi)
  const pool = effModels.filter((m) => bestGallery(listingsByModel.get(m.id) ?? [], imagesByListing));
  const poolMatchable = pool.map(matchable);
  const poolById = new Map(pool.map((m) => [m.id, m]));

  /** Mudelil on poes nähtav pilt: nähtav mudelipilt või tema müügis pakkumise oma foto (sama mis mapper) */
  const hasStorefrontImage = (m: ModelRow, extra = 0) =>
    extra > 0 ||
    (productImagesByModel.get(m.id) ?? []).some((r) => !r.isHidden) ||
    (listingsByModel.get(m.id) ?? []).some((l) => l.status === "ACTIVE" && l.available !== false && (imagesByListing.get(l.id) ?? []).some((i) => !i.isHidden));

  const report: NonNullable<EnrichmentReport["images"]> = {
    models: models.length,
    before: { withImages: 0, withoutImages: 0 },
    after: { withImages: 0, withoutImages: 0 },
    status: {},
    linkedLaptopidSameModel: 0,
    linkedLaptopidMatched: 0,
    review: 0,
    unresolved: 0,
    icecatAttempted: 0,
    icecatMatched: 0,
    icecatSkippedNoIdentifiers: 0,
    examples: [],
    reviewExamples: [],
    icecatResults: [],
  };

  const decisions = new Map<string, ModelImageEnrichment>();
  const added = new Map<string, number>();

  for (const model of effModels) {
    const rows = productImagesByModel.get(model.id) ?? [];
    const before = hasStorefrontImage(model);
    if (before) report.before.withImages++;
    else report.before.withoutImages++;
    const previous = (model.enrichment ?? {}).images;

    // 1. LOCAL: mudelil on juba pildid (või admin peitis Laptopid.ee pildid teadlikult) → ei puutu
    if (rows.some((r) => !r.isHidden) || rows.some((r) => r.source === "LAPTOPID")) {
      const sources = new Set(rows.filter((r) => !r.isHidden).map((r) => r.source));
      const status = sources.has("ICECAT") ? "ICECAT" : sources.has("LAPTOPID") || rows.some((r) => r.source === "LAPTOPID") ? "LAPTOPID" : "LOCAL";
      decisions.set(model.id, { ...(previous ?? {}), status, imageCount: rows.filter((r) => !r.isHidden).length, checkedAt: previous?.checkedAt ?? now.toISOString() });
      continue;
    }

    // 2. Laptopid.ee: sama mudel → muidu kindel vaste teise Laptopid.ee mudeliga
    const own = bestGallery(listingsByModel.get(model.id) ?? [], imagesByListing);
    let target: { model: ModelRow; gallery: NonNullable<ReturnType<typeof bestGallery>>; matchedBy: string; confidence: number } | null = null;
    if (own) target = { model, gallery: own, matchedBy: "same-model", confidence: 1 };
    else {
      const match = findModelMatch(matchable(model), poolMatchable);
      if (match.status === "MATCH") {
        const targetModel = poolById.get(match.target.id)!;
        target = { model: targetModel, gallery: bestGallery(listingsByModel.get(targetModel.id) ?? [], imagesByListing)!, matchedBy: match.matchedBy, confidence: match.confidence };
      } else if (match.status === "REVIEW") {
        decisions.set(model.id, { status: "REVIEW", candidates: match.candidates.map((c) => c.slug), matchedBy: match.matchedBy, confidence: null, icecat: previous?.icecat ?? null, checkedAt: now.toISOString() });
        report.reviewExamples.push({ model: model.slug, candidates: match.candidates.map((c) => c.slug), matchedBy: match.matchedBy });
        continue;
      }
    }

    if (!target) {
      decisions.set(model.id, { status: "UNRESOLVED", icecat: previous?.icecat ?? null, checkedAt: now.toISOString() });
      continue;
    }

    const sameModel = target.model.id === model.id;
    if (sameModel) report.linkedLaptopidSameModel++;
    else report.linkedLaptopidMatched++;
    if (report.examples.length < 40 && (!sameModel || report.examples.filter((e) => e.matchedModel === null).length < 10)) {
      report.examples.push({ model: model.slug, source: "LAPTOPID", matchedModel: sameModel ? null : target.model.slug, matchedBy: target.matchedBy, images: target.gallery.images.length });
    }
    decisions.set(model.id, {
      status: "LAPTOPID",
      matchedModelSlug: target.model.slug,
      matchedBy: `${target.matchedBy}; laptopid ${target.gallery.listing.sku}`,
      confidence: target.confidence,
      imageCount: target.gallery.images.length,
      checkedAt: now.toISOString(),
    });
    added.set(model.id, target.gallery.images.length);

    if (!options.dryRun) {
      const title = modelTitle(model);
      await db.transaction(async (tx) => {
        for (const [index, img] of target.gallery.images.entries()) {
          await tx
            .insert(productImages)
            .values({
              productModelId: model.id,
              source: "LAPTOPID",
              type: "MODEL_GENERIC",
              sourceId: `laptopid:${img.sourceId}`,
              position: 1000 + index,
              isMain: false,
              thumbnailPath: img.thumbnailUrl,
              mediumPath: img.mediumUrl,
              largePath: img.largeUrl,
              width: img.width ?? 0,
              height: img.height ?? 0,
              alt: img.alt || `${title} – foto ${index + 1}`,
              originalSourceUrl: img.largeUrl,
            })
            .onConflictDoNothing();
        }
        await normalizeImageOrder(tx, model.id);
      });
    }
  }

  // 3. Icecat — viimane allikas: ainult vasteta, poes müügis ja identifikaatoriga mudelid (muidu päringut ei tehta)
  if (options.icecat) {
    for (const model of effModels) {
      const decision = decisions.get(model.id)!;
      if (decision.status !== "UNRESOLVED" && decision.status !== "REVIEW") continue;
      const own = listingsByModel.get(model.id) ?? [];
      if (!own.some(onSale)) continue;
      const ids = await loadModelIdentifiers(db, model.id);
      const supplierMpns = [...new Set(own.map((l) => l.mpn?.trim()).filter((v): v is string => Boolean(v)))];
      const supplierGtins = [...new Set(own.map((l) => l.ean?.trim()).filter((v): v is string => Boolean(v)))];
      const merged: ModelIdentifiers = { ...ids, mpns: [...new Set([...supplierMpns, ...ids.mpns])], gtins: [...new Set([...supplierGtins, ...ids.gtins])] };
      if (!merged.gtins.length && !merged.mpns.length && !merged.icecatIds.length && !merged.confirmedIcecatId) {
        report.icecatSkippedNoIdentifiers++;
        decision.icecat = "NO_IDENTIFIERS";
        continue;
      }
      report.icecatAttempted++;
      if (options.dryRun) {
        decision.icecat = "DRY_RUN";
        continue;
      }
      // Tarnija MPN/EAN salvestatakse mudeli identifikaatoriks (admin näeb, mille järgi otsiti)
      for (const [kind, values] of [["MPN", supplierMpns], ["GTIN", supplierGtins]] as const) {
        for (const value of values) await db.insert(productIdentifiers).values({ productModelId: model.id, kind, value, source: "SUPPLIER" }).onConflictDoNothing();
      }
      const brandName = BRAND_NAMES[model.manufacturer as BrandCode] ?? model.manufacturer;
      const importModel: ModelToImport = { id: model.slug, title: modelTitle(model), brandName, modelName: modelTitle(model).slice(brandName.length + 1) };
      let result: ModelImportReport;
      try {
        result = await importModelImages(importModel, merged, options.icecat);
      } catch (error) {
        decision.icecat = "ERROR";
        log(`Icecat ${model.slug}: ${error instanceof Error ? error.message : String(error)}`);
        continue; // olemasolevaid andmeid ei muudeta, töö jätkub
      }
      decision.icecat = result.status;
      report.icecatResults.push({ model: model.slug, status: result.status, matchedBy: result.matchedBy, images: result.imageCount, title: result.icecatTitle });
      if (result.status === "MATCHED" && result.imageCount > 0) {
        report.icecatMatched++;
        Object.assign(decision, { status: "ICECAT", matchedBy: result.matchedBy, confidence: result.confidence, imageCount: result.imageCount, matchedModelSlug: null, candidates: undefined });
        added.set(model.id, result.imageCount);
      }
      log(`Icecat ${model.slug}: ${result.status} (${result.imageCount} pilti)`);
    }
  }

  for (const model of effModels) {
    const decision = decisions.get(model.id)!;
    report.status[decision.status] = (report.status[decision.status] ?? 0) + 1;
    if (decision.status === "REVIEW") report.review++;
    if (decision.status === "UNRESOLVED") report.unresolved++;
    if (hasStorefrontImage(model, added.get(model.id) ?? 0)) report.after.withImages++;
    else report.after.withoutImages++;
    const next: ModelEnrichment = { ...(model.enrichment ?? {}), images: decision };
    const comparable = (e: ModelEnrichment | null | undefined) => stableStringify({ ...e?.images, checkedAt: null });
    if (!options.dryRun && comparable(model.enrichment) !== comparable(next)) {
      await db.update(productModels).set({ enrichment: next }).where(eq(productModels.id, model.id));
    }
  }
  return report;
}

// ---- Tehnilised andmed --------------------------------------------------------------------------------------------

async function enrichSpecs(db: Database, models: ModelRow[], listings: ListingRow[], options: EnrichmentOptions, now: Date): Promise<NonNullable<EnrichmentReport["specs"]>> {
  const modelById = new Map(models.map((m) => [m.id, applyOverrides(m, m.manualOverrides, MODEL_OVERRIDABLE_FIELDS)]));
  const eff = listings.map((l) => ({ row: l, e: effective(l) }));

  // GPU: integreeritud graafika nimi sama CPU järgi (tarnija/admini väärtus; Laptopid.ee eelistatud)
  const gpuIndex = buildIntegratedGpuIndex(
    eff.filter(({ e }) => e.gpu?.trim() && e.gpuDedicated === false && e.cpu?.trim()).map(({ row, e }) => ({ cpu: e.cpu!, gpu: e.gpu!, supplier: row.supplier })),
  );

  // Kiirusindeks ja maks. sagedus: allikas Laptopid.ee pakkumiste oma väärtused (details), võti = TÄPNE CPU / GPU nimi
  const laptopidSources = eff.filter(({ row }) => row.supplier === "laptopid");
  const cpuBench = buildBenchmarkIndex(
    laptopidSources.flatMap(({ row, e }) => {
      const key = !("cpu" in row.manualOverrides) ? cpuBenchmarkKey(e.cpu) : null;
      const value = parseBenchmark(row.details?.cpuBenchmark3dmark06);
      return key && value !== null ? [{ key, value, label: e.cpu! }] : [];
    }),
  );
  const gpuBench = buildBenchmarkIndex(
    laptopidSources.flatMap(({ row, e }) => {
      const key = !("gpu" in row.manualOverrides) ? gpuBenchmarkKey(e.gpu) : null;
      const value = parseBenchmark(row.details?.gpuBenchmark3dmark11);
      return key && value !== null ? [{ key, value, label: e.gpu! }] : [];
    }),
  );
  const cpuMhz = buildBenchmarkIndex(
    laptopidSources.flatMap(({ row, e }) => {
      const key = !("cpu" in row.manualOverrides) ? cpuBenchmarkKey(e.cpu) : null;
      const value = validCpuMaxMhz(row.details?.cpuMaxMhz);
      return key && value !== null ? [{ key, value, label: e.cpu! }] : [];
    }),
  );
  const perf: PerformanceReport = {
    sourceKeys: { cpuBenchmark: cpuBench.index.size, gpuBenchmark: gpuBench.index.size, cpuMaxMhz: cpuMhz.index.size },
    conflicts: [
      ...cpuBench.conflicts.map((c) => ({ kind: "cpuBenchmark", ...c })),
      ...gpuBench.conflicts.map((c) => ({ kind: "gpuBenchmark", ...c })),
      ...cpuMhz.conflicts.map((c) => ({ kind: "cpuMaxMhz", ...c })),
    ],
    onSale: { cpuBenchmark: { direct: 0, matched: 0, missing: 0 }, gpuBenchmark: { direct: 0, matched: 0, missing: 0 }, cpuMaxMhz: { direct: 0, matched: 0, missing: 0 } },
    uniqueOnSale: { cpus: 0, cpusWithBenchmark: 0, cpusWithMaxMhz: 0, gpus: 0, gpusWithBenchmark: 0 },
    unresolvedCpus: [],
    unresolvedGpus: [],
    examples: { cpu: [], gpu: [], mhz: [] },
  };
  const uniqueCpu = new Map<string, { bench: boolean; mhz: boolean }>();
  const uniqueGpu = new Map<string, boolean>();
  const pushExample = (list: { name: string; value: number; source: string }[], name: string, value: number, source: string) => {
    if (list.length < 40 && !list.some((x) => x.name === name)) list.push({ name, value, source });
  };

  const report: NonNullable<EnrichmentReport["specs"]> = {
    performance: perf,
    listings: listings.length,
    gpuEnriched: { laptopid: 0, local: 0 },
    gpuStillGeneric: 0,
    resolutionEnriched: 0,
    changedListings: 0,
    cpuGenerationMissing: 0,
    cpuGenerationParsable: 0,
    examples: [],
  };

  for (const { row, e } of eff) {
    if (!e.cpuGeneration) {
      report.cpuGenerationMissing++;
      if (e.cpu && parseCpuInfo(e.cpu).generationKey) report.cpuGenerationParsable++;
    }
    const previous = row.enrichment ?? {};
    const next: ListingEnrichment = {};

    // GPU — ainult kui tarnija ütles "integreeritud" ja täpne nimi puudub; admini parandust ("gpu" võti) ei puututa
    if (!e.gpu?.trim() && e.gpuDedicated === false && !("gpu" in row.manualOverrides) && e.cpu) {
      const key = cpuGpuKey(e.cpu);
      const candidate = gpuIndex.get(key);
      if (candidate) {
        const value: EnrichedValue<string> = {
          value: candidate.value,
          source: candidate.source,
          matchedBy: `cpu:${key} (${candidate.samples} pakkumist)`,
          confidence: 0.9,
          at: previous.gpu?.value === candidate.value ? previous.gpu.at : now.toISOString(),
        };
        next.gpu = value;
        if (candidate.source === "LAPTOPID") report.gpuEnriched.laptopid++;
        else report.gpuEnriched.local++;
        if (report.examples.length < 15) report.examples.push({ sku: row.sku, cpu: e.cpu, gpu: candidate.value, source: candidate.source });
      } else report.gpuStillGeneric++;
    }

    // Resolutsioon — tarnija andis ainult nime (Apple "Retina"): sama mudeli + sama ekraani pakkumiste üksmeelne väärtus
    if (!e.resolution && e.resolutionLabel && !("resolution" in row.manualOverrides)) {
      const model = modelById.get(row.productModelId);
      const size = e.screenSizeIn ?? model?.screenSizeIn ?? null;
      const samples = eff.filter(
        (o) => o.row.productModelId === row.productModelId && o.e.resolution && size !== null && Math.abs((o.e.screenSizeIn ?? model?.screenSizeIn ?? -1) - size) < 0.05,
      );
      const values = new Set(samples.map((o) => o.e.resolution));
      if (values.size === 1) {
        const [resolution] = values;
        const allLaptopid = samples.every((o) => o.row.supplier === "laptopid");
        next.resolution = {
          value: { resolution: resolution!, label: samples[0].e.resolutionLabel },
          source: allLaptopid ? "LAPTOPID" : "LOCAL",
          matchedBy: `model:${model?.slug} ${size}" (${samples.length} pakkumist)`,
          confidence: 0.9,
          at: previous.resolution && previous.resolution.value.resolution === resolution ? previous.resolution.at : now.toISOString(),
        };
        report.resolutionEnriched++;
      }
    }

    // Kiirusindeks / maks. sagedus teistele tarnijatele: ainult kui pakkumisel endal pole ja admin pole CPU/GPU-d muutnud
    const at = now.toISOString();
    const cpuKey = !("cpu" in row.manualOverrides) ? cpuBenchmarkKey(e.cpu) : null;
    const effectiveGpu = e.gpu?.trim() ? e.gpu : (next.gpu?.value ?? null);
    const gpuKey = !("gpu" in row.manualOverrides) ? gpuBenchmarkKey(effectiveGpu) : null;
    const own = { cpu: parseBenchmark(row.details?.cpuBenchmark3dmark06), gpu: parseBenchmark(row.details?.gpuBenchmark3dmark11), mhz: validCpuMaxMhz(row.details?.cpuMaxMhz) };
    const assign = (field: "cpuBenchmark" | "gpuBenchmark" | "cpuMaxMhz", ownValue: number | null, key: string | null, index: Map<string, BenchmarkIndexEntry>, kind: string) => {
      if (ownValue !== null || !key) return;
      const hit = index.get(key);
      if (!hit) return;
      const prev = previous[field];
      next[field] = { value: hit.value, source: "LAPTOPID", matchedBy: `${kind}:${key} (${hit.samples} Laptopid.ee pakkumist)`, confidence: 1, at: prev?.value === hit.value ? prev.at : at };
    };
    assign("cpuBenchmark", own.cpu, cpuKey, cpuBench.index, "cpu");
    assign("gpuBenchmark", own.gpu, gpuKey, gpuBench.index, "gpu");
    assign("cpuMaxMhz", own.mhz, cpuKey, cpuMhz.index, "cpu");

    if (onSale(row)) {
      const p = effectivePerformance({ details: row.details, enrichment: next, manualOverrides: row.manualOverrides });
      const count = (field: keyof PerformanceReport["onSale"], ownValue: number | null, value: number | null) =>
        perf.onSale[field][ownValue !== null && value !== null ? "direct" : value !== null ? "matched" : "missing"]++;
      count("cpuBenchmark", own.cpu, p.cpuBenchmark);
      count("gpuBenchmark", own.gpu, p.gpuBenchmark);
      count("cpuMaxMhz", own.mhz, p.cpuMaxGhz);
      const sourceOf = (ownValue: number | null) => (ownValue !== null ? row.supplier.toUpperCase() : "LAPTOPID (täpne vaste)");
      if (e.cpu) {
        const u = uniqueCpu.get(e.cpu) ?? { bench: false, mhz: false };
        uniqueCpu.set(e.cpu, { bench: u.bench || p.cpuBenchmark !== null, mhz: u.mhz || p.cpuMaxGhz !== null });
        if (p.cpuBenchmark !== null) pushExample(perf.examples.cpu, e.cpu, p.cpuBenchmark, sourceOf(own.cpu));
        if (p.cpuMaxGhz !== null) pushExample(perf.examples.mhz, e.cpu, p.cpuMaxGhz * 1000, sourceOf(own.mhz));
      }
      if (effectiveGpu) {
        uniqueGpu.set(effectiveGpu, (uniqueGpu.get(effectiveGpu) ?? false) || p.gpuBenchmark !== null);
        if (p.gpuBenchmark !== null) pushExample(perf.examples.gpu, effectiveGpu, p.gpuBenchmark, sourceOf(own.gpu));
      }
    }

    const hasNext = Object.keys(next).length > 0;
    if (stableStringify(row.enrichment ?? null) !== stableStringify(hasNext ? next : null)) {
      report.changedListings++;
      if (!options.dryRun) await db.update(supplierListings).set({ enrichment: hasNext ? next : null }).where(eq(supplierListings.id, row.id));
    }
  }
  perf.uniqueOnSale = {
    cpus: uniqueCpu.size,
    cpusWithBenchmark: [...uniqueCpu.values()].filter((v) => v.bench).length,
    cpusWithMaxMhz: [...uniqueCpu.values()].filter((v) => v.mhz).length,
    gpus: uniqueGpu.size,
    gpusWithBenchmark: [...uniqueGpu.values()].filter(Boolean).length,
  };
  perf.unresolvedCpus = [...uniqueCpu].filter(([, v]) => !v.bench).map(([k]) => k).sort();
  perf.unresolvedGpus = [...uniqueGpu].filter(([, v]) => !v).map(([k]) => k).sort();
  return report;
}

// ---- Käivitus -----------------------------------------------------------------------------------------------------

export async function runCatalogEnrichment(db: Database, options: EnrichmentOptions = {}): Promise<EnrichmentReport> {
  const now = options.now ?? new Date();
  const models: ModelRow[] = await db
    .select({
      id: productModels.id,
      slug: productModels.slug,
      manufacturer: productModels.manufacturer,
      family: productModels.family,
      model: productModels.model,
      screenSizeIn: productModels.screenSizeIn,
      manualOverrides: productModels.manualOverrides,
      enrichment: productModels.enrichment,
    })
    .from(productModels);
  const listings = await loadListings(db);
  const report: EnrichmentReport = { dryRun: Boolean(options.dryRun), images: null, specs: null };
  if (options.images) report.images = await enrichImages(db, models, listings, options, now);
  if (options.specs) report.specs = await enrichSpecs(db, models, listings, options, now);
  return report;
}

/** Adminile: mudeli pildiallikate jaotus (Andmekvaliteet). */
export async function imageSourceCounts(db: Database, modelIds?: string[]) {
  const where = modelIds?.length ? inArray(productImages.productModelId, modelIds) : undefined;
  return db
    .select({ source: productImages.source, models: sql<number>`count(DISTINCT ${productImages.productModelId})::int` })
    .from(productImages)
    .where(and(eq(productImages.isHidden, false), where))
    .groupBy(productImages.source);
}

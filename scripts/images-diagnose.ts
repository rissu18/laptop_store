/**
 * Piltide katte diagnostika (AINULT LUGEMINE): npm run images:diagnose [-- --json fail.json]
 *
 * Miks mudelitel pole pilte või galerii on väike — päris põhjused numbritena:
 *   - katte grupid (0 / 1–4 / 5–10 / 10+) poe EFEKTIIVSE galerii järgi (sama mapper + buildModelGallery mis pood);
 *   - 0-pildiga mudelite peamine põhjus (Icecati otsus, tootja, mudelinimi, Laptopid.ee, tarnija pildid …);
 *   - tarnijate ja tootjate kaupa; Icecati NEEDS_REVIEW põhjused; 1–4 pildi põhjused;
 *   - pildid andmebaasis, aga poe galerii ei kasuta; orvud (failid ilma kirjeta, kirjed ilma failita).
 * Andmebaasi ega faile ei muudeta. Saladusi ei logita.
 */
import "./lib/load-env";
import { existsSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { BRAND_NAMES, type BrandCode } from "@/domain/catalog/types";
import { buildModelIdentity, cpuEraConflict, titleHasIdentity, titleScreenSize, requiresStrictIdentifier } from "@/domain/images/model-identity";
import { ICECAT_SUPPLIER_IDS } from "@/integrations/icecat/icecat-index";
import { getDb } from "@/server/db/client";
import { redactConnectionStrings } from "@/server/db/database-url";
import { icecatMetadata, listingImages, productIdentifiers, productImages, productModels, supplierListings } from "@/server/db/schema";
import { queryStorefrontCatalogRows } from "@/server/catalog/db-catalog";
import { mapCatalogRows } from "@/server/catalog/db-catalog-mapper";
import type { ModelEnrichment } from "@/domain/catalog/enrichment";

const urlKey = (url: string) => url.split("?")[0].replace(/\/+/g, "/").toLowerCase();
const pct = (n: number, total: number) => (total ? Math.round((n / total) * 1000) / 10 : 0);
const bucket = (n: number) => (n === 0 ? "0" : n <= 4 ? "1-4" : n <= 10 ? "5-10" : "10+");
const inc = (map: Record<string, number>, key: string, by = 1) => (map[key] = (map[key] ?? 0) + by);

async function main() {
  const db = getDb();
  const [storefront, models, listings, modelImages, unitImages, icecat, identifiers] = await Promise.all([
    queryStorefrontCatalogRows(db),
    db.select().from(productModels),
    db.select({
      id: supplierListings.id, productModelId: supplierListings.productModelId, supplier: supplierListings.supplier, status: supplierListings.status,
      available: supplierListings.available, stock: supplierListings.stock, qualityHold: supplierListings.qualityHold, cpu: supplierListings.cpu,
      manualOverrides: supplierListings.manualOverrides,
    }).from(supplierListings),
    db.select().from(productImages),
    db.select({ id: listingImages.id, supplierListingId: listingImages.supplierListingId, isHidden: listingImages.isHidden, largeUrl: listingImages.largeUrl, imageQuality: listingImages.imageQuality, visualHash: listingImages.visualHash }).from(listingImages),
    db.select().from(icecatMetadata),
    db.select({ productModelId: productIdentifiers.productModelId, kind: productIdentifiers.kind }).from(productIdentifiers),
  ]);

  // ---- Poe efektiivne galerii (sama mapper mis pood) ----------------------------------------------------------
  const { items } = mapCatalogRows(storefront.models, storefront.listings, storefront.images, storefront.unitImages);
  const modelBySlug = new Map(models.map((m) => [m.slug, m]));
  const modelById = new Map(models.map((m) => [m.id, m]));
  const listingById = new Map(listings.map((l) => [l.id, l]));
  const imagesByModel = Map.groupBy(modelImages, (i) => i.productModelId);
  const unitByListing = Map.groupBy(unitImages, (i) => i.supplierListingId);
  const listingsByModel = Map.groupBy(listings, (l) => l.productModelId);
  const icecatByModel = new Map(icecat.map((r) => [r.productModelId, r]));
  const idsByModel = Map.groupBy(identifiers, (r) => r.productModelId);
  const lastEnrichmentRun = models.map((m) => (m.enrichment as ModelEnrichment | null)?.images?.checkedAt).filter(Boolean).sort().at(-1) ?? null;

  // URL → pildi tüüp (päris / tühi / varupilt), et galeriist päris piltide arv lugeda
  const weakUrls = new Set<string>();
  for (const img of modelImages) if (img.type === "PLACEHOLDER" || img.source === "PLACEHOLDER" || img.imageQuality === "BLANK") weakUrls.add(urlKey(img.largePath));
  for (const img of unitImages) if (img.imageQuality === "BLANK") weakUrls.add(urlKey(img.largeUrl));

  interface ActiveModel {
    id: string; slug: string; title: string; manufacturer: string; family: string; model: string;
    suppliers: Set<string>; sellable: number; gallery: number; real: number;
  }
  const active = new Map<string, ActiveModel>();
  for (const { product, variant } of items) {
    const model = modelBySlug.get(product.slug)!;
    let entry = active.get(model.id);
    if (!entry) {
      const real = product.images.filter((v) => !weakUrls.has(urlKey(v.largeUrl))).length;
      entry = { id: model.id, slug: model.slug, title: product.title, manufacturer: model.manufacturer, family: model.family, model: model.model, suppliers: new Set(), sellable: 0, gallery: product.images.length, real };
      active.set(model.id, entry);
    }
    entry.suppliers.add(variant.supplier);
    entry.sellable++;
  }
  const all = [...active.values()];

  // ---- 12. Katte grupid -----------------------------------------------------------------------------------------
  const coverage: Record<string, number> = { "0": 0, "1-4": 0, "5-10": 0, "10+": 0 };
  for (const m of all) inc(coverage, bucket(m.real));

  // ---- Abiandmed mudeli kohta -------------------------------------------------------------------------------------
  const onSale = (l: (typeof listings)[number]) => l.status === "ACTIVE" && l.available !== false;
  function sourcesOf(m: ActiveModel) {
    const rows = imagesByModel.get(m.id) ?? [];
    const own = listingsByModel.get(m.id) ?? [];
    const unitAll = own.flatMap((l) => (unitByListing.get(l.id) ?? []).map((u) => ({ ...u, listing: l })));
    return {
      modelRows: rows,
      visibleModelRows: rows.filter((r) => !r.isHidden),
      hiddenModelRows: rows.filter((r) => r.isHidden),
      bySource: rows.filter((r) => !r.isHidden).reduce<Record<string, number>>((acc, r) => (inc(acc, r.source), acc), {}),
      unitOnSale: unitAll.filter((u) => !u.isHidden && onSale(u.listing)),
      unitNotOnSale: unitAll.filter((u) => !u.isHidden && !onSale(u.listing)),
      laptopidListings: own.filter((l) => l.supplier === "laptopid"),
      laptopidAny: own.some((l) => l.supplier === "laptopid"),
    };
  }

  /** Teine mudel (sama tootja), millel on sama identiteet ja pildid → nime / normaliseerimise probleem */
  const identityKey = (m: { manufacturer: string; family: string; model: string; screenSizeIn?: number | null }) =>
    `${m.manufacturer.toLowerCase()}|${[...buildModelIdentity({ manufacturer: m.manufacturer, family: m.family, model: m.model }).tokens].sort().join(" ")}`;
  const imagedByIdentity = new Map<string, string[]>();
  for (const m of models) {
    const visible = (imagesByModel.get(m.id) ?? []).filter((r) => !r.isHidden && r.type !== "PLACEHOLDER").length;
    if (!visible) continue;
    const key = identityKey(m);
    imagedByIdentity.set(key, [...(imagedByIdentity.get(key) ?? []), m.slug]);
  }

  // ---- 13. 0-pildiga mudelite peamine põhjus ------------------------------------------------------------------------
  const zero = all.filter((m) => m.real === 0);
  const zeroCause: Record<string, number> = {};
  const zeroFlags: Record<string, number> = {};
  const zeroExamples: { title: string; suppliers: string; cause: string; detail: string }[] = [];
  for (const m of zero) {
    const s = sourcesOf(m);
    const meta = icecatByModel.get(m.id);
    const model = modelById.get(m.id)!;
    const enrichment = (model.enrichment as ModelEnrichment | null)?.images;
    const identity = buildModelIdentity({ manufacturer: m.manufacturer, family: m.family, model: m.model });
    const numeric = identity.tokens.some((t) => /\d/.test(t));
    const sibling = (imagedByIdentity.get(identityKey(model)) ?? []).filter((slug) => slug !== m.slug);
    const ids = idsByModel.get(m.id) ?? [];
    let cause: string;
    let detail = "";
    if (s.visibleModelRows.length || s.unitOnSale.length) {
      cause = "07/08 pildid andmebaasis, aga galerii ei kasuta (BROKEN/BLANK/peidetud)";
      detail = `mudeli pilte ${s.visibleModelRows.length} (${[...new Set(s.visibleModelRows.map((r) => r.imageQuality ?? "analüüsimata"))].join("/")}), pakkumise fotosid ${s.unitOnSale.length}`;
    } else if (sibling.length) {
      cause = "12 nime/normaliseerimise probleem: sama identiteediga teisel mudelil on pildid";
      detail = `pildid on mudelil ${sibling.join(", ")}`;
    } else if (requiresStrictIdentifier(m.manufacturer)) {
      cause = "05 Apple — teadlik REVIEW (Icecati nimi liiga üldine, vaja GTIN/MPN-i)";
      detail = `GTIN/MPN mudelil: ${ids.filter((i) => i.kind === "GTIN" || i.kind === "MPN").length}`;
    } else if (!ICECAT_SUPPLIER_IDS[m.manufacturer.toLowerCase()]) {
      cause = "01 tootjat pole Open Icecati sülearvutite indeksis";
      detail = `tootja "${m.manufacturer}"`;
    } else if (!numeric) {
      cause = "04 mudelinimi liiga ebamäärane (pole eristavat numbrit/põlvkonda)";
      detail = `identiteet: ${identity.tokens.join(" ")}`;
    } else if (meta?.status === "NEEDS_REVIEW") {
      cause = "03 Icecati vaste leiti, aga jäi REVIEW";
      detail = `${meta.reason}: ${meta.error ?? ""} → "${meta.icecatTitle ?? ""}"`;
    } else if (meta?.status === "NOT_FOUND" && meta.error?.includes("pole kasutatavaid pilte")) {
      cause = "06 Icecati toode leiti, aga pilte polnud";
      detail = meta.error;
    } else if (meta?.status === "NOT_FOUND" && meta.error?.includes("andmelehti ei saanud")) {
      cause = "13a Icecati andmelehte ei saanud lugeda";
      detail = meta.error;
    } else if (meta?.status === "NOT_FOUND") {
      cause = "02 tootja Icecatis olemas, mudelit indeksist ei leitud";
      detail = meta.error ?? meta.reason ?? "";
    } else if (meta?.status === "MATCHED") {
      cause = (s.hiddenModelRows.length ? "08 alla laaditud pildid peidetud/tagasi lükatud" : "07 vaste MATCHED, aga pildifailid puuduvad (allalaadimine ebaõnnestus)");
      detail = `icecat ${meta.icecatId}, imageCount ${meta.imageCount}`;
    } else if (meta?.status === "ERROR") {
      cause = "13b Icecat ei vastanud (ERROR)";
      detail = meta.error ?? "";
    } else if (meta?.status === "REJECTED") {
      cause = "13c admin lükkas Icecati vaste tagasi";
    } else if (!enrichment) {
      cause = "13d rikastust pole selle mudeli jaoks käivitatud (uus mudel pärast viimast rikastust)";
      detail = `mudel loodud ${model.createdAt.toISOString().slice(0, 10)}, viimane rikastus ${lastEnrichmentRun?.slice(0, 10) ?? "–"}`;
    } else {
      cause = "13e rikastus käis, Icecati katset ei salvestatud (kandidaat jäi välja)";
      detail = `enrichment.images.status=${enrichment.status}, icecat=${enrichment.icecat ?? "–"}`;
    }
    inc(zeroCause, cause);
    // Lisatunnused (mitte välistavad)
    if (!s.laptopidAny) inc(zeroFlags, "09 Laptopid.ee-l seda mudelit pole");
    else if (!s.laptopidListings.some((l) => (unitByListing.get(l.id) ?? []).length)) inc(zeroFlags, "10 Laptopid.ee-l mudel olemas, aga fotosid pole");
    if (s.unitNotOnSale.length) inc(zeroFlags, "pakkumise fotod olemas ainult müügist läinud pakkumistel");
    if (![...m.suppliers].includes("laptopid")) inc(zeroFlags, "11 müügis ainult Tech/Foxway (tarnijad pilte ei anna)");
    if (!ids.length) inc(zeroFlags, "GTIN/MPN puudub");
    if (enrichment?.status === "REVIEW") inc(zeroFlags, "Laptopid.ee vaste REVIEW (kandidaadid olemas)");
    zeroExamples.push({ title: m.title, suppliers: [...m.suppliers].sort().join("+"), cause, detail });
  }

  // ---- 14. Tarnijate kaupa ----------------------------------------------------------------------------------------
  const supplierGroup = (m: ActiveModel) => (m.suppliers.size > 1 ? "multi-supplier" : `${[...m.suppliers][0]} only`);
  const bySupplier: Record<string, Record<string, number>> = {};
  for (const m of all) {
    const g = (bySupplier[supplierGroup(m)] ??= { models: 0, "0": 0, "1-4": 0, "5+": 0 });
    g.models++;
    inc(g, m.real === 0 ? "0" : m.real <= 4 ? "1-4" : "5+");
  }

  // ---- 15. Tootjate kaupa ------------------------------------------------------------------------------------------
  const byBrand: Record<string, Record<string, number>> = {};
  for (const m of all) {
    const g = (byBrand[BRAND_NAMES[m.manufacturer as BrandCode] ?? m.manufacturer] ??= { models: 0, "0": 0, "1-4": 0, "5+": 0 });
    g.models++;
    inc(g, m.real === 0 ? "0" : m.real <= 4 ? "1-4" : "5+");
  }

  // ---- 16. Icecati NEEDS_REVIEW ----------------------------------------------------------------------------------------
  const reviewCause: Record<string, number> = {};
  const reviewRows: { title: string; activeImages: number | null; cause: string; icecat: string; error: string }[] = [];
  for (const meta of icecat.filter((r) => r.status === "NEEDS_REVIEW")) {
    const model = modelById.get(meta.productModelId);
    if (!model) continue;
    const identity = buildModelIdentity({ manufacturer: model.manufacturer, family: model.family, model: model.model, screenSizeIn: model.screenSizeIn });
    const title = meta.icecatTitle ?? "";
    const error = meta.error ?? "";
    const cpus = [...new Set((listingsByModel.get(model.id) ?? []).map((l) => l.cpu).filter((c): c is string => Boolean(c)))];
    const formWords = /x360|yoga|rugged|2-in-1|flip|detachable|convertible|fold|dragonfly|studio|vision|360/i;
    const titleScreen = titleScreenSize(title);
    let cause: string;
    if (requiresStrictIdentifier(model.manufacturer)) cause = "Apple ambiguity";
    else if (/põlvkond|põlvkonda/.test(error)) cause = "generation missing";
    else if (/seeria puudub/.test(error)) cause = "family mismatch";
    else if (/tundmatu lisasõna/.test(error)) cause = "word-order / normalization issue (Icecatis lisasõna)";
    else if (title.includes("protsessor teisest ajastust") || (cpus.length && cpuEraConflict(title, cpus))) cause = "CPU era conflict";
    else if (titleScreen && identity.screenSizeIn && Math.abs(titleScreen - identity.screenSizeIn) >= 0.6) cause = "screen size conflict";
    else if (formWords.test(title) !== formWords.test(`${model.family} ${model.model}`)) cause = "form factor mismatch";
    else if (title && titleHasIdentity(identity, title)) cause = "likely safe match but matcher too conservative";
    else if (/ei kinnita mudelit/.test(error)) cause = "family mismatch (pealkirjas teine seeria/mudel)";
    else cause = "genuinely unsafe / muu";
    inc(reviewCause, cause);
    reviewRows.push({ title: `${BRAND_NAMES[model.manufacturer as BrandCode] ?? model.manufacturer} ${model.family} ${model.model}`, activeImages: active.get(model.id)?.real ?? null, cause, icecat: `${meta.icecatId ?? "–"} "${title}"`, error });
  }

  // ---- 17. 1–4 pildi põhjused ---------------------------------------------------------------------------------------------
  const smallCause: Record<string, number> = {};
  const smallFlags: Record<string, number> = {};
  const smallExamples: { title: string; real: number; cause: string; modelRows: number; unitRowsOnSale: number; icecat: string }[] = [];
  for (const m of all.filter((x) => x.real >= 1 && x.real <= 4)) {
    const s = sourcesOf(m);
    const meta = icecatByModel.get(m.id);
    const icecatRows = s.visibleModelRows.filter((r) => r.source === "ICECAT").length;
    const laptopidRows = (s.bySource.LAPTOPID ?? 0) + s.unitOnSale.filter((u) => u.listing.supplier === "laptopid").length;
    const candidatesTotal = s.visibleModelRows.filter((r) => r.type !== "PLACEHOLDER").length + s.unitOnSale.length;
    let cause: string;
    if (meta?.status === "MATCHED" && icecatRows > 0 && meta.imageCount <= 4) cause = "Icecatil oligi ainult 1–4 pilti";
    else if (meta?.status === "MATCHED" && icecatRows < meta.imageCount) cause = "Icecati vaste olemas, aga ainult osa pilte alla laaditud";
    else if (icecatRows === 0 && laptopidRows > 0 && (!meta || meta.status !== "MATCHED")) cause = `Laptopid.ee-only galerii (Icecat: ${meta?.status ?? "katset pole"})`;
    else if (icecatRows === 0 && laptopidRows === 0) cause = "ainult muud allikad";
    else cause = "Icecat + Laptopid kokku 1–4";
    inc(smallCause, cause);
    // Rikastus valib Icecati kandidaadid ridade arvu järgi (< 5 nähtavat mudelipilti) — koopiad ei ole uued pildid
    if (!meta && s.visibleModelRows.length >= 5) inc(smallFlags, "Icecati katset ei tehtud: mudelipilte ≥ 5 rida, aga pärast dedupe't 1–4 (koopiad)");
    smallExamples.push({ title: m.title, real: m.real, cause, modelRows: s.visibleModelRows.length, unitRowsOnSale: s.unitOnSale.length, icecat: meta ? `${meta.status} ${meta.imageCount} pilti` : "–" });
    if (candidatesTotal - m.gallery >= 3) inc(smallFlags, "dedupe/kvaliteet eemaldas ≥ 3 pilti");
    if (s.visibleModelRows.some((r) => r.imageQuality === "BLANK" || r.imageQuality === "BROKEN") || s.unitOnSale.some((u) => u.imageQuality === "BLANK" || u.imageQuality === "BROKEN")) inc(smallFlags, "BLANK/BROKEN pilte välja jäetud");
    if (s.unitNotOnSale.length) inc(smallFlags, "fotod olemas müügist läinud pakkumistel (galerii ei kasuta)");
    if (s.hiddenModelRows.length) inc(smallFlags, "peidetud mudelipilte");
  }

  // ---- 18. Pildid andmebaasis, aga poe galerii ei kasuta ---------------------------------------------------------------------
  const unused: { title: string; gallery: number; dbVisible: number; reasons: string }[] = [];
  for (const m of all) {
    const s = sourcesOf(m);
    const okModel = s.visibleModelRows.filter((r) => r.type !== "PLACEHOLDER" && r.imageQuality !== "BROKEN" && r.imageQuality !== "BLANK");
    const okUnits = s.unitOnSale.filter((u) => u.imageQuality !== "BROKEN" && u.imageQuality !== "BLANK");
    const distinctUrls = new Set([...okModel.map((r) => urlKey(r.largePath)), ...okUnits.map((u) => urlKey(u.largeUrl))]);
    if (distinctUrls.size > m.real) {
      const hashes = [...okModel.map((r) => r.visualHash), ...okUnits.map((u) => u.visualHash)].filter(Boolean);
      const reasons = distinctUrls.size - m.real <= hashes.length - new Set(hashes).size ? "visuaalne duplikaat (räsi)" : "visuaalne duplikaat / lähedane räsi";
      unused.push({ title: m.title, gallery: m.real, dbVisible: distinctUrls.size, reasons });
    }
  }
  const galleryUsesNone = all.filter((m) => m.real === 0 && sourcesOf(m).visibleModelRows.some((r) => r.type !== "PLACEHOLDER" && r.imageQuality !== "BROKEN"));
  const soldPhotosOnly = all.filter((m) => sourcesOf(m).unitNotOnSale.length > 0);
  const soldPhotosGain = soldPhotosOnly.filter((m) => m.real < 5).map((m) => {
    const s = sourcesOf(m);
    const extra = new Set(s.unitNotOnSale.filter((u) => u.imageQuality !== "BROKEN" && u.imageQuality !== "BLANK").map((u) => urlKey(u.largeUrl))).size;
    return { title: m.title, real: m.real, soldListingPhotos: extra };
  });

  // ---- 19. Orvud ---------------------------------------------------------------------------------------------------------------
  const mediaRoot = path.join(process.cwd(), "public");
  const productDir = path.join(mediaRoot, "media", "products");
  const filesOnDisk = new Set<string>();
  let diskBytes = 0;
  const walk = (dir: string) => {
    if (!existsSync(dir)) return;
    for (const name of readdirSync(dir)) {
      const full = path.join(dir, name);
      const stat = statSync(full);
      if (stat.isDirectory()) walk(full);
      else {
        filesOnDisk.add("/" + path.relative(mediaRoot, full).split(path.sep).join("/"));
        diskBytes += stat.size;
      }
    }
  };
  walk(productDir);
  const referenced = new Set<string>();
  let missingFiles = 0;
  const missingExamples: string[] = [];
  for (const img of modelImages) {
    for (const p of [img.thumbnailPath, img.mediumPath, img.largePath]) {
      if (!p.startsWith("/media/")) continue;
      referenced.add(p);
      if (!filesOnDisk.has(p)) {
        missingFiles++;
        if (missingExamples.length < 5) missingExamples.push(`${modelById.get(img.productModelId)?.slug}: ${p}`);
      }
    }
  }
  const orphanFiles = [...filesOnDisk].filter((f) => !referenced.has(f));
  const inactiveModelImages = modelImages.filter((img) => !img.isHidden && !active.has(img.productModelId));
  const unitOnUnsold = unitImages.filter((u) => {
    const l = listingById.get(u.supplierListingId);
    return l && !onSale(l);
  });

  const result = {
    generatedAt: new Date().toISOString(),
    lastEnrichmentRun,
    totals: { productModelsInDb: models.length, productModelsStatusActive: models.filter((m) => m.status === "ACTIVE").length, activeModelsOnSale: all.length, sellableListings: items.length },
    coverage: Object.fromEntries(Object.entries(coverage).map(([k, v]) => [k, { models: v, pct: pct(v, all.length) }])),
    zeroCauses: Object.entries(zeroCause).sort(([a], [b]) => a.localeCompare(b)),
    zeroFlags,
    bySupplier,
    byBrand: Object.entries(byBrand).sort(([, a], [, b]) => b["0"] - a["0"] || b.models - a.models),
    icecatReview: { total: reviewRows.length, onSaleZeroImages: reviewRows.filter((r) => r.activeImages === 0).length, causes: reviewCause, rows: reviewRows },
    smallGallery: { models: all.filter((x) => x.real >= 1 && x.real <= 4).length, causes: smallCause, flags: smallFlags, examples: smallExamples },
    unusedInStorefront: { galleryUsesNoneOfDbImages: galleryUsesNone.length, modelsWithFewerThanDb: unused.length, examples: unused.slice(0, 15) },
    soldListingPhotos: { models: soldPhotosOnly.length, modelsUnder5ThatWouldGain: soldPhotosGain.filter((g) => g.soldListingPhotos > 0).length, examples: soldPhotosGain.sort((a, b) => b.soldListingPhotos - a.soldListingPhotos).slice(0, 15) },
    orphans: {
      filesOnDisk: filesOnDisk.size, diskMb: Math.round(diskBytes / 1048576), orphanFiles: orphanFiles.length, orphanExamples: orphanFiles.slice(0, 5),
      dbPathsMissingOnDisk: missingFiles, missingExamples,
      modelImagesOfModelsNotOnSale: inactiveModelImages.length, modelsNotOnSaleWithImages: new Set(inactiveModelImages.map((i) => i.productModelId)).size,
      listingImagesOfListingsNotOnSale: unitOnUnsold.length,
      hiddenModelImages: modelImages.filter((i) => i.isHidden).length,
      brokenOrBlank: { BROKEN: modelImages.filter((i) => i.imageQuality === "BROKEN").length + unitImages.filter((i) => i.imageQuality === "BROKEN").length, BLANK: modelImages.filter((i) => i.imageQuality === "BLANK").length + unitImages.filter((i) => i.imageQuality === "BLANK").length },
    },
    zeroExamples: zeroExamples.sort((a, b) => a.cause.localeCompare(b.cause) || a.title.localeCompare(b.title)),
  };

  const jsonArg = process.argv.indexOf("--json");
  if (jsonArg >= 0 && process.argv[jsonArg + 1]) {
    const { writeFile } = await import("node:fs/promises");
    await writeFile(process.argv[jsonArg + 1], JSON.stringify(result, null, 2));
  }
  // Konsoolile kokkuvõte; täielikud nimekirjad (näited, REVIEW read) ainult --json failis
  const summary = { ...result, zeroExamples: result.zeroExamples.length, icecatReview: { ...result.icecatReview, rows: result.icecatReview.rows.length } };
  console.log(JSON.stringify(summary, null, 1));
}

main()
  .catch((error) => {
    console.error("VIGA:", redactConnectionStrings(error instanceof Error ? (error.stack ?? error.message) : String(error)));
    process.exitCode = 1;
  })
  .finally(() => setTimeout(() => process.exit(), 50));

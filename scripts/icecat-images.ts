/**
 * Icecati tootepiltide import ja Data Quality käsurealt (kuni Phase 3 adminpaneelini).
 *
 *   npm run icecat -- import --all             kõik ProductModelid (üks päring mudeli, mitte konfiguratsiooni kohta)
 *                                              + raport docs/reports/icecat-catalog-report.md
 *   npm run icecat -- import --test            10 testmudelit + raport docs/reports/icecat-test-report.md
 *   npm run icecat -- import --models a,b      valitud mudelid (slug'id)
 *   npm run icecat -- import --all --rematch   otsi vasted uuesti (muutumata pilte alla ei laeta)
 *   npm run icecat -- import --all --force     otsi vasted uuesti ja lae kõik pildid uuesti alla
 *   npm run icecat -- status                   Data Quality ülevaade
 *   npm run icecat -- images <mudel>           mudeli pildid koos Icecati pildi ID-dega
 *   npm run icecat -- hide <mudel> <pildiId>   peida eksitav pilt (nt klaviatuuri lähivõte)
 *   npm run icecat -- unhide <mudel> <pildiId>
 *   npm run icecat -- confirm <mudel> <icecatId>   käsitsi vaste (kõrgeim prioriteet)
 *   npm run icecat -- reject <mudel> <icecatId>    lükka vaste tagasi (pildid eemaldatakse)
 *   npm run icecat -- retry <mudel>                otsi vastet uuesti
 *   npm run icecat -- refresh <mudel>              lae mudeli pildid uuesti alla
 *
 * Keskkonnamuutujad loetakse failist .env.local (ICECAT_USERNAME, ICECAT_API_TOKEN, ICECAT_CONTENT_TOKEN).
 */
import { existsSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { createIcecatClientFromEnv } from "@/integrations/icecat/icecat-client";
import { MockSupplierAdapter } from "@/integrations/supplier/mock/mock-supplier-adapter";
import { mapWithConcurrency } from "@/server/concurrency/map-with-concurrency";
import { buildDataQualityOverview, describeReason, type DataQualityOverview } from "@/server/images/data-quality";
import { importModelImages, type ImportOptions, type ModelImportReport } from "@/server/images/icecat-image-import";
import { JsonFileImageRepository } from "@/server/images/image-repository";
import { loadCuratedIdentifiers, mergeIdentifiers, saveCuratedIdentifiers } from "@/server/images/model-identifiers";
import { groupOffersIntoModels } from "@/server/images/product-models";
import { LocalImageStorageAdapter } from "@/server/images/storage/local-image-storage";

const TEST_MODELS = [
  "lenovo-thinkpad-t14-gen-2",
  "lenovo-thinkpad-t14-gen-3",
  "lenovo-thinkpad-x1-carbon-gen-9",
  "dell-latitude-5420",
  "dell-latitude-5430",
  "dell-latitude-7420",
  "hp-elitebook-840-g8",
  "hp-elitebook-850-g8",
  "hp-elitebook-845-g8",
  "hp-probook-450-g8",
];

/** Mitu mudelit korraga Icecatist päritakse (spetsifikatsioon: 2–5). */
const MODEL_CONCURRENCY = 3;

if (existsSync(".env.local")) process.loadEnvFile(".env.local");

const repository = new JsonFileImageRepository();

async function loadModels() {
  const { offers } = await new MockSupplierAdapter().getProducts();
  return groupOffersIntoModels(offers);
}

function requireClient() {
  const client = createIcecatClientFromEnv();
  if (!client) {
    console.error("ICECAT_USERNAME puudub. Lisa see faili .env.local (vt .env.example).");
    process.exit(1);
  }
  return client;
}

async function runImport(selection: string[] | "all", options: ImportOptions = {}) {
  const client = requireClient();
  const storage = new LocalImageStorageAdapter();
  const curated = await loadCuratedIdentifiers();
  const all = await loadModels();
  const models = selection === "all" ? all : all.filter((m) => selection.includes(m.model.id));

  const missing = selection === "all" ? [] : selection.filter((id) => !all.some((m) => m.model.id === id));
  if (missing.length) console.warn(`Kataloogis puuduvad mudelid: ${missing.join(", ")}`);

  const reports = await mapWithConcurrency(models, MODEL_CONCURRENCY, async ({ model, supplierIdentifiers }) => {
    const ids = mergeIdentifiers(supplierIdentifiers, curated.models[model.id]);
    const report = await importModelImages(model, ids, { icecat: client, storage, repository }, options);
    console.log(
      `${report.status.padEnd(13)} ${model.title.padEnd(38)} ${(report.matchedBy ?? report.reason ?? "-").padEnd(28)} pilte ${report.imageCount} (uued ${report.downloaded}, muutumata ${report.unchanged}, duplikaate ${report.duplicates}, vigu ${report.failed})`,
    );
    return report;
  });
  return { reports, models };
}

async function overview(onlyIds?: string[]): Promise<DataQualityOverview> {
  const models = (await loadModels())
    .filter((m) => !onlyIds || onlyIds.includes(m.model.id))
    .map((m) => ({ id: m.model.id, title: m.model.title, listingCount: m.offerCount }));
  return buildDataQualityOverview(models, await repository.listMatches(), await repository.listAllImages());
}

function summaryLines(o: DataQualityOverview): string[] {
  return [
    `- ProductModeleid kokku: **${o.modelsTotal}**`,
    `- MATCHED: **${o.icecat.MATCHED}**`,
    `- NEEDS_REVIEW: **${o.icecat.NEEDS_REVIEW}**`,
    `- NOT_FOUND: **${o.icecat.NOT_FOUND}**`,
    `- ERROR: **${o.icecat.ERROR}**`,
    ...(o.icecat.REJECTED ? [`- REJECTED (admin): **${o.icecat.REJECTED}**`] : []),
    `- Pildiga mudeleid: **${o.images.withImages}** / ${o.modelsTotal} → image coverage **${o.images.coveragePct}%**`,
    `- Rohkem kui üks pilt: **${o.gallery.multipleImages}** → gallery coverage **${Math.round((o.gallery.multipleImages / Math.max(1, o.modelsTotal)) * 1000) / 10}%**`,
    `- Ainult põhipilt: **${o.gallery.mainImageOnly}**`,
    `- Keskmine pilte pildiga mudeli kohta: **${o.gallery.averageImages}**`,
  ];
}

async function writeReport(fileName: string, title: string, command: string, reports: ModelImportReport[], listingCounts: Map<string, number>, o: DataQualityOverview) {
  const table = reports
    .sort((a, b) => a.title.localeCompare(b.title))
    .map((r) => {
      const match = r.icecatId ? `Icecat ${r.icecatId}` : "–";
      const method = r.matchType ? `${r.matchType}${r.matchedBy ? ` (${r.matchedBy})` : ""}` : "–";
      const confidence = r.confidence !== null ? String(r.confidence) : "–";
      const status = r.reason ? `${r.status} · ${r.reason}` : r.status;
      return `| ${r.title} | ${listingCounts.get(r.modelId) ?? 0} | ${match} | ${method} | ${confidence} | ${r.hasMainImage ? "Jah" : "Ei"} | ${r.galleryCount} | ${status} |`;
    });
  const withoutImages = o.modelsWithoutImages.map((r) => `| ${r.title} | ${r.match?.status ?? "–"} | ${describeReason(r.match)} |`);

  const content = `# ${title}

Käivitatud: ${new Date().toISOString().slice(0, 16).replace("T", " ")} UTC
Käsk: \`${command}\`
Ligipääs: Open Icecat (kasutajanimi, ilma API/content tokenita)
Pildid: allalaaditud ja töödeldud meie salvestusruumi (\`LocalImageStorageAdapter\` → \`public/media/products/\`), Icecati URL-e frontend ei kasuta.

## Kokkuvõte

${summaryLines(o).join("\n")}

Üks ProductModel = üks Icecati päring; kõik selle mudeli konfiguratsioonid (Listings) jagavad samu pilte.
"Gallery" = kuvatavad pildid lisaks põhipildile (duplikaadid ja peidetud pildid välja arvatud, max 12 pilti mudeli kohta).

| ProductModel | Listings | Match | Method | Confidence | Main image | Gallery | Status |
|---|---|---|---|---|---|---|---|
${table.join("\n")}

## Mudelid ilma pildita

| Mudel | Staatus | Mida teha |
|---|---|---|
${withoutImages.join("\n") || "| – | – | – |"}

## Üksikasjad

${reports
  .map((r) => {
    const attempts = r.attempts.map((a) => `  - ${a.identifier}: ${a.result}${a.message ? ` — ${a.message}` : ""}`).join("\n");
    return `### ${r.title}\n\n- Staatus: ${r.status}${r.reason ? ` (${r.reason})` : ""}\n- Icecati pealkiri: ${r.icecatTitle ?? "–"}\n- Päringud:\n${attempts || "  - (ei tehtud — identifikaatorid puuduvad)"}${r.errors.length ? `\n- Vead: ${r.errors.join("; ")}` : ""}`;
  })
  .join("\n\n")}
`;
  await mkdir(path.join("docs", "reports"), { recursive: true });
  await writeFile(path.join("docs", "reports", fileName), content, "utf8");
  console.log(`\nRaport: docs/reports/${fileName}`);
}

async function status() {
  const o = await overview();
  console.log("\nDATA QUALITY");
  for (const line of summaryLines(o)) console.log(line.replace(/\*\*/g, ""));
  console.log(`\nMudelid ilma pildita (${o.modelsWithoutImages.length}):`);
  for (const row of o.modelsWithoutImages) console.log(`  ${row.id.padEnd(34)} ${(row.match?.status ?? "-").padEnd(13)} ${describeReason(row.match)}`);
  const review = o.rows.filter((r) => r.match?.status === "NEEDS_REVIEW");
  if (review.length) {
    console.log(`\nVajab ülevaatust (${review.length}):`);
    for (const row of review) console.log(`  ${row.id.padEnd(34)} Icecat ${row.match?.icecatId} · ${row.match?.icecatTitle}`);
  }
  const hidden = o.rows.filter((r) => r.hiddenCount > 0);
  if (hidden.length) console.log(`\nPeidetud pilte: ${hidden.map((r) => `${r.id} (${r.hiddenCount})`).join(", ")}`);
}

async function listImages(modelId: string) {
  const images = (await repository.listAllImages())[modelId] ?? [];
  if (!images.length) return console.log(`${modelId}: pilte pole`);
  for (const image of images) {
    console.log(`${String(image.position + 1).padStart(2)}. pildi ID ${image.sourceId}${image.isMain ? " [PÕHIPILT]" : ""}${image.isHidden ? " [PEIDETUD]" : ""} ${image.largeUrl}`);
  }
}

async function setHidden(modelId: string, sourceId: string, hidden: boolean) {
  const ok = await repository.setImageHidden(modelId, sourceId, hidden);
  console.log(ok ? `${hidden ? "Peidetud" : "Nähtavaks tehtud"}: ${modelId} pilt ${sourceId}` : "Pilti ei leitud (vt: npm run icecat -- images <mudel>)");
}

async function setDecision(modelId: string, icecatId: string, decision: "confirm" | "reject") {
  if (!modelId || !/^\d+$/.test(icecatId ?? "")) {
    console.error(`Kasutus: npm run icecat -- ${decision} <mudeli-slug> <icecatId>`);
    process.exit(1);
  }
  const curated = await loadCuratedIdentifiers();
  const entry = curated.models[modelId] ?? { gtins: [], mpns: [], icecatIds: [] };
  if (decision === "confirm") {
    entry.confirmedIcecatId = icecatId;
    entry.rejectedIcecatIds = (entry.rejectedIcecatIds ?? []).filter((id) => id !== icecatId);
  } else {
    entry.rejectedIcecatIds = [...new Set([...(entry.rejectedIcecatIds ?? []), icecatId])];
    if (entry.confirmedIcecatId === icecatId) delete entry.confirmedIcecatId;
  }
  curated.models[modelId] = entry;
  await saveCuratedIdentifiers(curated);
  console.log(`${decision === "confirm" ? "Kinnitatud" : "Tagasi lükatud"}: ${modelId} → Icecat ${icecatId}`);
  await runImport([modelId], { rematch: true });
}

async function main() {
  const [command, ...args] = process.argv.slice(2);
  const flag = (name: string) => args.includes(`--${name}`);
  const value = (name: string) => args[args.indexOf(`--${name}`) + 1];

  switch (command) {
    case "import": {
      const selection = flag("all") ? "all" : flag("test") ? TEST_MODELS : (value("models") ?? "").split(",").filter(Boolean);
      if (selection !== "all" && selection.length === 0) {
        console.error("Vali mudelid: --test, --all või --models a,b");
        process.exit(1);
      }
      const options = { force: flag("force"), rematch: flag("force") || flag("rematch") };
      const { reports, models } = await runImport(selection, options);
      const counts = new Map(models.map((m) => [m.model.id, m.offerCount]));
      const command = `npm run icecat -- ${args.join(" ")}`.replace("  ", " ");
      if (flag("all")) await writeReport("icecat-catalog-report.md", "Icecati piltide raport — kogu kataloog", command, reports, counts, await overview());
      if (flag("test")) await writeReport("icecat-test-report.md", "Icecati piltide testraport (10 mudelit)", command, reports, counts, await overview(TEST_MODELS));
      break;
    }
    case "status":
      await status();
      break;
    case "images":
      await listImages(args[0]);
      break;
    case "hide":
    case "unhide":
      await setHidden(args[0], args[1], command === "hide");
      break;
    case "confirm":
    case "reject":
      await setDecision(args[0], args[1], command);
      break;
    case "retry":
      await runImport([args[0]], { rematch: true });
      break;
    case "refresh":
      await runImport([args[0]], { force: true });
      break;
    default:
      console.log("Käsud: import, status, images, hide, unhide, confirm, reject, retry, refresh (vt scripts/icecat-images.ts)");
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});

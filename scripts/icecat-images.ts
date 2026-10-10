/**
 * Icecati tootepiltide import ja Data Quality käsurealt (kuni Phase 3 adminpaneelini).
 *
 *   npm run icecat -- import --test            10 testmudelit + raport docs/reports/icecat-test-report.md
 *   npm run icecat -- import --all             kõik kataloogi mudelid
 *   npm run icecat -- import --models a,b      valitud mudelid (slug'id)
 *   npm run icecat -- import --test --rematch  otsi vasted uuesti (muutumata pilte alla ei laeta)
 *   npm run icecat -- import --all --force     otsi vasted uuesti ja lae kõik pildid uuesti alla
 *   npm run icecat -- status                   Data Quality ülevaade
 *   npm run icecat -- confirm <mudel> <icecatId>   admin kinnitab vaste
 *   npm run icecat -- reject <mudel> <icecatId>    admin lükkab vaste tagasi (pildid eemaldatakse)
 *   npm run icecat -- retry <mudel>                proovi vastet uuesti leida
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
import { DATA_QUALITY_GROUPS, buildDataQualityOverview } from "@/server/images/data-quality";
import { importModelImages, type ImportOptions, type ModelImportReport } from "@/server/images/icecat-image-import";
import { JsonFileImageRepository, readImageManifestSync } from "@/server/images/image-repository";
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

async function runImport(selection: string[] | "all", options: ImportOptions = {}): Promise<ModelImportReport[]> {
  const client = requireClient();
  const repository = new JsonFileImageRepository();
  const storage = new LocalImageStorageAdapter();
  const curated = await loadCuratedIdentifiers();
  const all = await loadModels();
  const models = selection === "all" ? all : all.filter((m) => selection.includes(m.model.id));

  const missing = selection === "all" ? [] : selection.filter((id) => !all.some((m) => m.model.id === id));
  if (missing.length) console.warn(`Kataloogis puuduvad mudelid: ${missing.join(", ")}`);

  return mapWithConcurrency(models, MODEL_CONCURRENCY, async ({ model, supplierIdentifiers }) => {
    const ids = mergeIdentifiers(supplierIdentifiers, curated.models[model.id]);
    const report = await importModelImages(model, ids, { icecat: client, storage, repository }, options);
    console.log(
      `${report.status.padEnd(15)} ${model.title.padEnd(36)} ${report.matchedBy ?? "-"} | pilte ${report.hasMainImage ? 1 + report.galleryCount : 0} (uued ${report.downloaded}, muutumata ${report.unchanged}, vigu ${report.failed})`,
    );
    return report;
  });
}

function reportTable(reports: ModelImportReport[]): string {
  const rows = reports.map((r) => {
    const matched = r.icecatId ? `Jah (Icecat ID ${r.icecatId})` : "Ei";
    const method = r.matchType ? `${r.matchType}${r.confidence !== null ? ` (${r.confidence})` : ""}` : "–";
    const result =
      r.status === "MATCHED" ? "✅ Pildid live'is" : r.status === "NEEDS_REVIEW" ? "⚠️ Vajab ülevaatust" : `❌ ${r.status}`;
    return `| ${r.title} | ${matched} | ${method} | ${r.hasMainImage ? "Jah" : "Ei"} | ${r.galleryCount} | ${result} |`;
  });
  return [
    "| Mudel | Icecat match | Match method | Main image | Gallery images | Result |",
    "|---|---|---|---|---|---|",
    ...rows,
  ].join("\n");
}

async function writeTestReport(reports: ModelImportReport[]) {
  const found = reports.filter((r) => r.icecatId);
  const withMain = reports.filter((r) => r.hasMainImage);
  const withGallery = reports.filter((r) => r.galleryCount > 0);
  const details = reports
    .map((r) => {
      const attempts = r.attempts.map((a) => `  - ${a.identifier}: ${a.result}${a.message ? ` — ${a.message}` : ""}`).join("\n");
      return `### ${r.title}\n\n- Staatus: ${r.status}\n- Icecati pealkiri: ${r.icecatTitle ?? "–"}\n- Päringud:\n${attempts || "  - (puuduvad)"}${r.errors.length ? `\n- Vead: ${r.errors.join("; ")}` : ""}`;
    })
    .join("\n\n");

  const content = `# Icecati piltide testraport

Käivitatud: ${new Date().toISOString().slice(0, 16).replace("T", " ")} UTC
Käsk: \`npm run icecat -- import --test\`
Ligipääs: Open Icecat (kasutajanimi, ilma API/content tokenita)

## Kokkuvõte

- Testitud mudeleid: **${reports.length}**
- Icecat leidis: **${found.length}**
- Põhipilt olemas: **${withMain.length}**
- Galerii (lisaks põhipildile) olemas: **${withGallery.length}**

${reportTable(reports)}

Galerii veerg näitab pilte LISAKS põhipildile (duplikaadid eemaldatud, max 12 pilti mudeli kohta).

## Üksikasjad

${details}
`;
  await mkdir(path.join("docs", "reports"), { recursive: true });
  await writeFile(path.join("docs", "reports", "icecat-test-report.md"), content, "utf8");
  console.log("\nRaport: docs/reports/icecat-test-report.md");
}

async function status() {
  const models = (await loadModels()).map((m) => m.model);
  const matches = await new JsonFileImageRepository().listMatches();
  const manifest = readImageManifestSync();
  const counts = Object.fromEntries(Object.entries(manifest).map(([id, images]) => [id, images.length]));
  const overview = buildDataQualityOverview(models, matches, counts);
  for (const group of DATA_QUALITY_GROUPS) {
    const rows = overview[group.key];
    console.log(`\n${group.label} (${rows.length})`);
    for (const row of rows) {
      const m = row.match;
      console.log(`  ${row.modelId.padEnd(34)} pilte ${row.imageCount}${m?.icecatId ? ` · Icecat ${m.icecatId}` : ""}${m?.matchType ? ` · ${m.matchType} ${m.confidence}` : ""}${m?.error ? ` · ${m.error}` : ""}`);
    }
  }
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
  // Rakenda otsus kohe (kinnitus → pildid; tagasilükkamine → otsitakse uut vastet või eemaldatakse pildid)
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
      const reports = await runImport(selection, { force: flag("force"), rematch: flag("force") || flag("rematch") });
      if (flag("test")) await writeTestReport(reports);
      break;
    }
    case "status":
      await status();
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
      console.log("Käsud: import, status, confirm, reject, retry, refresh (vt scripts/icecat-images.ts)");
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});

import https from "node:https";
import readline from "node:readline";
import zlib from "node:zlib";

/**
 * Open Icecati toodete indeks (`files.index.xml.gz`) — Icecati AMETLIK viis leida toode mudelinime järgi
 * (JSON API otsib ainult GTIN / Brand + ProductCode / icecat_id järgi).
 *
 * Indeks on ~300 MB (gzip), ~7,8 M toodet. Seda EI salvestata: fail loetakse voona rida-realt, jäetakse alles ainult
 * sülearvutite kategooria + meie kataloogi tootjad ning iga rida antakse kohe edasi (`onRow`), kus seda võrreldakse
 * meie rikastust vajavate mudelitega. Ainult offline (CLI); pood seda kunagi ei kasuta.
 *
 * Autentimine: Open Icecati kasutajanimi + parool (HTTP Basic, ainult päises; ei logita).
 */

export const ICECAT_INDEX_URL = "https://data.icecat.biz/export/freexml/EN/files.index.xml.gz";

/** Icecati kategooria "Notebooks" */
export const ICECAT_NOTEBOOK_CATEGORY_ID = "151";

/**
 * Meie tootja kood → Icecati tootja (Supplier_id). Ainult tootja enda kirjed — mitte refurbisherid
 * (nt "HP EliteBook 840 G7 (Refurbished)" teise tarnija ID-ga). Kontrollitud indeksist 2026-10-12.
 * Microsoft, Huawei, Panasonic, Razer, Xiaomi sülearvuteid Open Icecati sülearvutite kategoorias pole.
 */
export const ICECAT_SUPPLIER_IDS: Record<string, string> = {
  hp: "1",
  apple: "9",
  acer: "7",
  fujitsu: "15",
  samsung: "26",
  asus: "161",
  msi: "278",
  dell: "292",
  lg: "293",
  lenovo: "728",
  gigabyte: "739",
  honor: "12550",
};

export interface IcecatIndexRow {
  productId: string;
  supplierId: string;
  /** Tootja kood (MPN) */
  prodId: string;
  catid: string;
  /** ICECAT (toimetatud) / SUPPLIER / NOEDITOR … */
  quality: string;
  onMarket: boolean;
  hasHighPic: boolean;
  /** YYYYMMDDHHMMSS */
  updated: string;
  modelName: string;
  limited: boolean;
}

const ATTRIBUTE = /\s([A-Za-z_]+)="([^"]*)"/g;

function decodeXml(value: string): string {
  return value
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#(\d+);/g, (_, n: string) => String.fromCodePoint(Number(n)))
    .replace(/&amp;/g, "&");
}

/** Üks indeksi `<file …>` rida → kirje (muud read → null). Atribuudid on Icecati indeksis ühel real. */
export function parseIndexFileLine(line: string): IcecatIndexRow | null {
  if (!line.startsWith("<file ")) return null;
  const attrs: Record<string, string> = {};
  for (const match of line.matchAll(ATTRIBUTE)) attrs[match[1]] = match[2];
  if (!attrs.Product_ID) return null;
  return {
    productId: attrs.Product_ID,
    supplierId: attrs.Supplier_id ?? "",
    prodId: decodeXml(attrs.Prod_ID ?? ""),
    catid: attrs.Catid ?? "",
    quality: attrs.Quality ?? "",
    onMarket: attrs.On_Market === "1",
    hasHighPic: Boolean(attrs.HighPic),
    updated: attrs.Updated ?? "",
    modelName: decodeXml(attrs.Model_Name ?? ""),
    limited: attrs.Limited === "Yes",
  };
}

export interface IndexStreamStats {
  products: number;
  kept: number;
}

/** Filtreerib read: ainult sülearvutid ja antud tootjad. Kasutab ka voog ise (testitav ilma võrguta). */
export async function filterIndexLines(
  lines: AsyncIterable<string>,
  supplierIds: Set<string>,
  onRow: (row: IcecatIndexRow) => void,
): Promise<IndexStreamStats> {
  const stats: IndexStreamStats = { products: 0, kept: 0 };
  for await (const line of lines) {
    // Kiire eelfilter enne regex'it — enamik ridu ei ole sülearvutid
    if (!line.startsWith("<file ")) continue;
    stats.products++;
    if (!line.includes(` Catid="${ICECAT_NOTEBOOK_CATEGORY_ID}"`)) continue;
    const row = parseIndexFileLine(line);
    if (!row || !supplierIds.has(row.supplierId)) continue;
    stats.kept++;
    onRow(row);
  }
  return stats;
}

export interface IcecatIndexConfig {
  username: string;
  password: string;
  url?: string;
  timeoutMs?: number;
}

/** Laeb indeksi voona (gzip lahti voos, ilma kettale salvestamata) ja annab sülearvutite read edasi. */
export function streamIcecatIndex(config: IcecatIndexConfig, supplierIds: Set<string>, onRow: (row: IcecatIndexRow) => void): Promise<IndexStreamStats> {
  const auth = Buffer.from(`${config.username}:${config.password}`).toString("base64");
  return new Promise((resolve, reject) => {
    const request = https.get(config.url ?? ICECAT_INDEX_URL, { headers: { Authorization: `Basic ${auth}`, "Accept-Encoding": "identity" } }, (response) => {
      if (response.statusCode !== 200) {
        response.resume();
        reject(new Error(`Icecati indeks: HTTP ${response.statusCode}${response.statusCode === 401 ? " (kontrolli ICECAT_USERNAME / ICECAT_PASSWORD)" : ""}`));
        return;
      }
      const gunzip = zlib.createGunzip();
      gunzip.on("error", reject);
      response.on("error", reject);
      const lines = readline.createInterface({ input: response.pipe(gunzip), crlfDelay: Infinity });
      filterIndexLines(lines, supplierIds, onRow).then(resolve, reject);
    });
    request.setTimeout(config.timeoutMs ?? 120_000, () => request.destroy(new Error("Icecati indeks: aegumine")));
    request.on("error", reject);
  });
}

/**
 * Indeksi lokaalne vahemälu iteratiivseks kuivkäivituseks (CLI `--index-cache fail.jsonl`): esimene käivitus voogedastab
 * indeksi ja salvestab ainult sülearvutite read KÕIGILT toetatud tootjatelt (JSONL, ~kümned MB), järgmised loevad faili.
 * Fail on tööfail (scratch), mitte repo osa. Pood seda kunagi ei loe.
 */
export async function cachedIcecatIndex(config: IcecatIndexConfig, file: string, supplierIds: Set<string>, onRow: (row: IcecatIndexRow) => void): Promise<IndexStreamStats> {
  const { createReadStream, createWriteStream, existsSync } = await import("node:fs");
  if (!existsSync(file)) {
    const out = createWriteStream(`${file}.partial`);
    const all = new Set(Object.values(ICECAT_SUPPLIER_IDS));
    const stats = await streamIcecatIndex(config, all, (row) => out.write(`${JSON.stringify(row)}\n`));
    await new Promise<void>((resolve, reject) => out.end((error?: Error | null) => (error ? reject(error) : resolve())));
    const { rename } = await import("node:fs/promises");
    await rename(`${file}.partial`, file);
    console.log(`  Icecati indeks salvestatud vahemällu: ${stats.kept} sülearvutit (${stats.products} toodet)`);
  }
  const stats: IndexStreamStats = { products: 0, kept: 0 };
  const lines = readline.createInterface({ input: createReadStream(file), crlfDelay: Infinity });
  for await (const line of lines) {
    if (!line) continue;
    stats.products++;
    const row = JSON.parse(line) as IcecatIndexRow;
    if (!supplierIds.has(row.supplierId)) continue;
    stats.kept++;
    onRow(row);
  }
  return stats;
}

export function icecatIndexConfigFromEnv(env: NodeJS.ProcessEnv = process.env): IcecatIndexConfig | null {
  const username = env.ICECAT_USERNAME?.trim();
  const password = env.ICECAT_PASSWORD?.trim();
  return username && password ? { username, password } : null;
}

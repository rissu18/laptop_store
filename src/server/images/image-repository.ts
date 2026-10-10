import { existsSync, readFileSync } from "node:fs";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import type { IcecatMatchRecord } from "@/domain/images/icecat-match";
import type { ProductImageRecord } from "@/domain/images/product-image";

/**
 * Pildikirjete ja Icecati vastete hoidla.
 *
 * Phase 2-ni (PostgreSQL) hoitakse andmeid JSON failides:
 * - `data/media/product-images.json` — ProductImage kirjed. Viitavad kohalikule salvestusruumile,
 *   seega on Git'ist välja jäetud (nagu ka `public/media`).
 * - `data/icecat/matches.json` — Icecati vasted ja nende staatus (Data Quality). Commit'itakse:
 *   see ei sisalda saladusi ega pilte, ainult Icecati ID-d ja otsuseid.
 *
 * Phase 2-s tuleb asemele PrismaImageRepository sama liidesega.
 */
export interface ProductImageRepository {
  listImages(productModelId: string): Promise<ProductImageRecord[]>;
  replaceImages(productModelId: string, records: ProductImageRecord[]): Promise<void>;
  /** Admin: peida/näita üks pilt (Icecati pildi ID järgi). Tagastab false, kui pilti pole. */
  setImageHidden(productModelId: string, sourceId: string, hidden: boolean): Promise<boolean>;
  listAllImages(): Promise<Record<string, ProductImageRecord[]>>;
  getMatch(productModelId: string): Promise<IcecatMatchRecord | null>;
  saveMatch(record: IcecatMatchRecord): Promise<void>;
  listMatches(): Promise<IcecatMatchRecord[]>;
}

export const DEFAULT_DATA_DIR = path.join(process.cwd(), "data");

type ImagesFile = Record<string, ProductImageRecord[]>;
type MatchesFile = Record<string, IcecatMatchRecord>;

async function readJson<T>(filePath: string, fallback: T): Promise<T> {
  try {
    return JSON.parse(await readFile(filePath, "utf8")) as T;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return fallback;
    throw error;
  }
}

/** Kirjutab ajutisse faili ja nimetab ümber — katkestuse korral ei jää poolik JSON maha. */
async function writeJsonAtomic(filePath: string, data: unknown): Promise<void> {
  await mkdir(path.dirname(filePath), { recursive: true });
  const tmp = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  await writeFile(tmp, `${JSON.stringify(data, null, 2)}\n`, "utf8");
  // Windowsis võib rename ajutiselt ebaõnnestuda, kui faili hoiab lahti viirusetõrje või indekseerija
  for (let attempt = 0; ; attempt++) {
    try {
      await rename(tmp, filePath);
      return;
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if ((code !== "EPERM" && code !== "EBUSY" && code !== "EACCES") || attempt >= 5) throw error;
      await new Promise((resolve) => setTimeout(resolve, 50 * (attempt + 1)));
    }
  }
}

/**
 * Faili kaupa järjekord: mitu paralleelset importi teevad "loe → muuda → kirjuta" kordamööda,
 * muidu kirjutaks üks teise muudatused üle. (PostgreSQL-is lahendavad selle tehingud.)
 */
const fileLocks = new Map<string, Promise<unknown>>();

function withFileLock<T>(filePath: string, task: () => Promise<T>): Promise<T> {
  const previous = fileLocks.get(filePath) ?? Promise.resolve();
  const next = previous.catch(() => undefined).then(task);
  fileLocks.set(filePath, next);
  return next;
}

function sortedObject<T>(record: Record<string, T>): Record<string, T> {
  return Object.fromEntries(Object.entries(record).sort(([a], [b]) => a.localeCompare(b)));
}

export class JsonFileImageRepository implements ProductImageRepository {
  private readonly imagesPath: string;
  private readonly matchesPath: string;

  constructor(dataDir = DEFAULT_DATA_DIR) {
    this.imagesPath = path.join(dataDir, "media", "product-images.json");
    this.matchesPath = path.join(dataDir, "icecat", "matches.json");
  }

  async listImages(productModelId: string) {
    return withFileLock(this.imagesPath, async () => (await readJson<ImagesFile>(this.imagesPath, {}))[productModelId] ?? []);
  }

  async replaceImages(productModelId: string, records: ProductImageRecord[]) {
    await withFileLock(this.imagesPath, async () => {
      const all = await readJson<ImagesFile>(this.imagesPath, {});
      if (records.length) all[productModelId] = [...records].sort((a, b) => a.position - b.position);
      else delete all[productModelId];
      await writeJsonAtomic(this.imagesPath, sortedObject(all));
    });
  }

  async setImageHidden(productModelId: string, sourceId: string, hidden: boolean) {
    return withFileLock(this.imagesPath, async () => {
      const all = await readJson<ImagesFile>(this.imagesPath, {});
      const records = all[productModelId] ?? [];
      const target = records.find((r) => r.sourceId === sourceId);
      if (!target) return false;
      target.isHidden = hidden;
      // Põhipilt = esimene nähtav pilt
      let mainAssigned = false;
      for (const record of [...records].sort((a, b) => a.position - b.position)) {
        record.isMain = !record.isHidden && !mainAssigned;
        if (record.isMain) mainAssigned = true;
      }
      await writeJsonAtomic(this.imagesPath, sortedObject(all));
      return true;
    });
  }

  async listAllImages() {
    return withFileLock(this.imagesPath, () => readJson<ImagesFile>(this.imagesPath, {}));
  }

  async getMatch(productModelId: string) {
    return withFileLock(this.matchesPath, async () => (await readJson<MatchesFile>(this.matchesPath, {}))[productModelId] ?? null);
  }

  async saveMatch(record: IcecatMatchRecord) {
    await withFileLock(this.matchesPath, async () => {
      const all = await readJson<MatchesFile>(this.matchesPath, {});
      all[record.productModelId] = record;
      await writeJsonAtomic(this.matchesPath, sortedObject(all));
    });
  }

  async listMatches() {
    return withFileLock(this.matchesPath, async () => Object.values(await readJson<MatchesFile>(this.matchesPath, {})));
  }
}

/** Data Quality vaate jaoks: kõik Icecati vasted (sünkroonselt). */
export function readMatchesSync(dataDir = DEFAULT_DATA_DIR): IcecatMatchRecord[] {
  const filePath = path.join(dataDir, "icecat", "matches.json");
  if (!existsSync(filePath)) return [];
  try {
    return Object.values(JSON.parse(readFileSync(filePath, "utf8")) as MatchesFile);
  } catch {
    return [];
  }
}

/**
 * Kataloogi jaoks: loeb kõik pildikirjed sünkroonselt (üks kord serveri käivitumisel).
 * Kui faili pole (nt Vercelis, kus kohalikke pilte pole), tagastab tühja objekti → placeholder.
 */
export function readImageManifestSync(dataDir = DEFAULT_DATA_DIR): ImagesFile {
  const filePath = path.join(dataDir, "media", "product-images.json");
  if (!existsSync(filePath)) return {};
  try {
    return JSON.parse(readFileSync(filePath, "utf8")) as ImagesFile;
  } catch {
    return {};
  }
}

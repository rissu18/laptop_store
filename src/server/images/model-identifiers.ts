import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import type { ModelIdentifiers } from "@/integrations/icecat/icecat-matcher";
import { DEFAULT_DATA_DIR } from "./image-repository";

/**
 * Mudelite identifikaatorid Icecati päringuteks.
 * Allikad (prioriteedi järjekorras):
 *   1. tarnija feed (GTIN/EAN, tootja kood) — kõige usaldusväärsem, sest kirjeldab päris seadet;
 *   2. käsitsi kogutud koodid failis data/icecat/model-identifiers.json;
 *   3. admini kinnitus/tagasilükkamine (samas failis).
 */

const entrySchema = z.object({
  gtins: z.array(z.string()).default([]),
  mpns: z.array(z.string()).default([]),
  icecatIds: z.array(z.string()).default([]),
  confirmedIcecatId: z.string().regex(/^\d+$/).optional(),
  rejectedIcecatIds: z.array(z.string()).optional(),
});

const fileSchema = z.object({ _comment: z.string().optional(), models: z.record(z.string(), entrySchema) });
type IdentifiersFile = z.infer<typeof fileSchema>;

const filePath = (dataDir: string) => path.join(dataDir, "icecat", "model-identifiers.json");

export async function loadCuratedIdentifiers(dataDir = DEFAULT_DATA_DIR): Promise<IdentifiersFile> {
  try {
    return fileSchema.parse(JSON.parse(await readFile(filePath(dataDir), "utf8")));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return { models: {} };
    throw error;
  }
}

export async function saveCuratedIdentifiers(data: IdentifiersFile, dataDir = DEFAULT_DATA_DIR): Promise<void> {
  const models = Object.fromEntries(Object.entries(data.models).sort(([a], [b]) => a.localeCompare(b)));
  await writeFile(filePath(dataDir), `${JSON.stringify({ ...data, models }, null, 2)}\n`, "utf8");
}

/** Tarnija identifikaatorid enne käsitsi kogutuid; duplikaadid eemaldatakse. */
export function mergeIdentifiers(supplier: { gtins: string[]; mpns: string[] }, curated?: z.infer<typeof entrySchema>): ModelIdentifiers {
  const unique = (list: string[]) => [...new Set(list.map((v) => v.trim()).filter(Boolean))];
  return {
    gtins: unique([...supplier.gtins, ...(curated?.gtins ?? [])]),
    mpns: unique([...supplier.mpns, ...(curated?.mpns ?? [])]),
    icecatIds: unique(curated?.icecatIds ?? []),
    confirmedIcecatId: curated?.confirmedIcecatId,
    rejectedIcecatIds: curated?.rejectedIcecatIds,
  };
}

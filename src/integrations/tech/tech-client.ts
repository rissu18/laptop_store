import "server-only";
import { HttpRequestError, fetchWithRetry } from "@/server/http/fetch-with-retry";
import { TechConfigError, readTechConfig } from "./tech-config";

export { isTechConfigured } from "./tech-config";

/**
 * Tech hinnakirja allalaadimine XLSX-ina — AINULT serveris (sync, cron, admin "Sync now", CLI).
 * Pood ega brauser ei loe Google Sheetsi kunagi: andmed jõuavad poodi ainult sync'i kaudu PostgreSQL-ist.
 * Autentimist ega Google'i kontot pole vaja (avalik tabel). Vastus peab olema XLSX (zip) — HTML
 * (nt sisselogimisleht) või muu vorming → viga, kataloogi ei muudeta.
 */

const MAX_BYTES = 25 * 1024 * 1024;
const ALLOWED_FINAL_HOSTS = /(^|\.)(docs\.google\.com|googleusercontent\.com)$/i;

export type TechSourceErrorCode = "NOT_CONFIGURED" | "NETWORK" | "HTTP" | "NOT_XLSX" | "TOO_LARGE";

export class TechSourceError extends Error {
  constructor(
    public readonly code: TechSourceErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "TechSourceError";
  }
}

export interface TechWorkbookDownload {
  data: Uint8Array;
  bytes: number;
  fetchedAt: Date;
  durationMs: number;
}

export async function fetchTechWorkbook(options: { fetchImpl?: typeof fetch; env?: Record<string, string | undefined> } = {}): Promise<TechWorkbookDownload> {
  let exportUrl: string;
  try {
    exportUrl = readTechConfig(options.env).exportUrl;
  } catch (error) {
    if (error instanceof TechConfigError) throw new TechSourceError("NOT_CONFIGURED", error.message);
    throw error;
  }
  const started = Date.now();
  let response: Response;
  try {
    response = await fetchWithRetry(exportUrl, { cache: "no-store", redirect: "follow" }, { timeoutMs: 30_000, maxRetries: 2, baseDelayMs: 1_000, fetchImpl: options.fetchImpl });
  } catch (error) {
    throw new TechSourceError("NETWORK", error instanceof HttpRequestError ? error.message : "Võrguviga");
  }
  if (!response.ok) {
    await response.body?.cancel().catch(() => undefined);
    throw new TechSourceError("HTTP", `Google Sheets eksport: HTTP ${response.status}`);
  }
  if (response.url) {
    const host = new URL(response.url).hostname;
    if (!ALLOWED_FINAL_HOSTS.test(host)) {
      await response.body?.cancel().catch(() => undefined);
      throw new TechSourceError("HTTP", `Ootamatu ümbersuunamine (${host})`);
    }
  }
  if (Number(response.headers.get("content-length") ?? 0) > MAX_BYTES) {
    await response.body?.cancel().catch(() => undefined);
    throw new TechSourceError("TOO_LARGE", "XLSX on liiga suur");
  }
  const data = new Uint8Array(await response.arrayBuffer());
  if (data.byteLength > MAX_BYTES) throw new TechSourceError("TOO_LARGE", "XLSX on liiga suur");
  if (!isZip(data)) {
    const type = response.headers.get("content-type") ?? "?";
    throw new TechSourceError("NOT_XLSX", `Vastus ei ole XLSX (${type.split(";")[0]}) — kas tabel on avalik?`);
  }
  return { data, bytes: data.byteLength, fetchedAt: new Date(), durationMs: Date.now() - started };
}

/** XLSX on zip-fail: algab baitidega "PK\x03\x04" */
export function isZip(data: Uint8Array): boolean {
  return data.length > 4 && data[0] === 0x50 && data[1] === 0x4b && data[2] === 0x03 && data[3] === 0x04;
}

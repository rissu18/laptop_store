import "server-only";
import { FoxwayConfigError, readFoxwayConfig } from "./foxway-config";
import { TransportError, httpsTransport, type FoxwayTransport, type TransportResponse } from "./foxway-transport";
import { FOXWAY_FEEDS, FOXWAY_LAPTOP_DIMENSION_GROUP, parseFoxwayPricelist, type FoxwayFeed, type FoxwayFeedKey, type ParsedPricelist } from "./foxway-schema";

export { isFoxwayConfigured } from "./foxway-config";

/**
 * Foxway API klient — AINULT serveris (sync, cron, admin "Sync now", CLI). Pood ega brauser ei pöördu kunagi Foxway
 * poole: andmed jõuavad poodi ainult sync'i kaudu PostgreSQL-ist (supplier API → meie DB → storefront).
 *
 * Kasutatav otspunkt: GET /api/v1/catalogs/{urlSlug}/pricelist?dimensionGroupId=11&itemGroupId={12|54}
 * Päis `X-ApiKey` (saladus) — võtit ei logita ega panda veateadetesse.
 *
 * NB! Foxway API tagastab ilma `Accept-Encoding: gzip` päiseta HTTP 200 ja TÜHJA keha (Content-Length: 0) — seega
 * saadetakse päis alati ja tühi keha on viga (EMPTY_BODY), mitte "tühi nimekiri" (`[]` on tühi nimekiri).
 * Transport on node:https (foxway-transport.ts), mitte Next.js-i paigatud fetch. Kuni 3 katset (võrk, 5xx, 429).
 */

const TIMEOUT_MS = 45_000;
const MAX_BYTES = 20 * 1024 * 1024;
const MAX_ATTEMPTS = 3;

export type FoxwaySourceErrorCode = "NOT_CONFIGURED" | "NETWORK" | "AUTH" | "HTTP" | "EMPTY_BODY" | "TOO_LARGE" | "INVALID_JSON" | "SCHEMA";

export class FoxwaySourceError extends Error {
  constructor(
    public readonly code: FoxwaySourceErrorCode,
    message: string,
    public readonly feed: FoxwayFeedKey | null = null,
  ) {
    super(message);
    this.name = "FoxwaySourceError";
  }
}

export interface FoxwayFeedResult {
  feed: FoxwayFeed;
  pricelist: ParsedPricelist;
  /** Dekodeeritud JSON-i maht (märki) */
  bytes: number;
  /** Võrgus liikunud (gzip) baidid */
  wireBytes: number;
  attempts: number;
  durationMs: number;
}

export interface FoxwayFetchOptions {
  /** Testides asendatav (vaikimisi node:https + zlib) */
  transport?: FoxwayTransport;
  env?: Record<string, string | undefined>;
  sleep?: (ms: number) => Promise<void>;
}

export function pricelistUrl(baseUrl: string, feed: Pick<FoxwayFeed, "catalog" | "itemGroupId">): string {
  const params = new URLSearchParams({ dimensionGroupId: String(FOXWAY_LAPTOP_DIMENSION_GROUP), itemGroupId: String(feed.itemGroupId) });
  return `${baseUrl}/api/v1/catalogs/${encodeURIComponent(feed.catalog)}/pricelist?${params}`;
}

const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));
const retryable = (status: number) => status === 408 || status === 429 || status >= 500;

/** Üks hinnakirja päring (üks kataloog × üks ItemGroup). Kõik vead → FoxwaySourceError (võtmeta sõnumiga). */
export async function fetchFoxwayFeed(feed: FoxwayFeed, options: FoxwayFetchOptions = {}): Promise<FoxwayFeedResult> {
  let config;
  try {
    config = readFoxwayConfig(options.env);
  } catch (error) {
    if (error instanceof FoxwayConfigError) throw new FoxwaySourceError("NOT_CONFIGURED", error.message, feed.key);
    throw error;
  }
  const transport = options.transport ?? httpsTransport;
  const sleep = options.sleep ?? defaultSleep;
  const started = Date.now();
  const headers = { "X-ApiKey": config.apiKey, Accept: "application/json", "Accept-Encoding": "gzip", "User-Agent": "sylearvutid-sync/1.0" };
  let response: TransportResponse | null = null;
  let attempts = 0;
  let lastProblem = "";
  while (attempts < MAX_ATTEMPTS) {
    attempts++;
    try {
      response = await transport(pricelistUrl(config.baseUrl, feed), headers, { timeoutMs: TIMEOUT_MS, maxBytes: MAX_BYTES });
      if (!retryable(response.status)) break;
      lastProblem = `HTTP ${response.status}`;
    } catch (error) {
      if (error instanceof TransportError && error.phase === "size") throw new FoxwaySourceError("TOO_LARGE", `${feed.label}: vastus on liiga suur`, feed.key);
      lastProblem = error instanceof Error ? error.message : "võrguviga";
    }
    response = null;
    if (attempts < MAX_ATTEMPTS) await sleep(1_500 * 2 ** (attempts - 1));
  }
  if (!response) throw new FoxwaySourceError("NETWORK", `${feed.label}: päring ebaõnnestus ${attempts} katsega (${lastProblem})`, feed.key);
  if (response.status === 401 || response.status === 403) throw new FoxwaySourceError("AUTH", `${feed.label}: HTTP ${response.status} — API võti puudub, on vale või aegunud`, feed.key);
  if (response.status < 200 || response.status >= 300) throw new FoxwaySourceError("HTTP", `${feed.label}: HTTP ${response.status}`, feed.key);
  const text = response.body;
  if (text.trim() === "") throw new FoxwaySourceError("EMPTY_BODY", `${feed.label}: tühi vastus (HTTP ${response.status}) — ei ole usaldusväärne nimekiri`, feed.key);
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    throw new FoxwaySourceError("INVALID_JSON", `${feed.label}: vastus ei ole JSON`, feed.key);
  }
  let pricelist: ParsedPricelist;
  try {
    pricelist = parseFoxwayPricelist(json);
  } catch {
    throw new FoxwaySourceError("SCHEMA", `${feed.label}: vastus ei ole hinnakirja ridade massiiv`, feed.key);
  }
  return { feed, pricelist, bytes: text.length, wireBytes: response.wireBytes, attempts, durationMs: Date.now() - started };
}

/**
 * Kõik neli feed'i (working/new × PC/Mac) järjest. Ükskõik milline viga → kogu laadimine ebaõnnestub (snapshot pole
 * täielik → sync FAILED, kataloogi ei muudeta). "new · PC" võib seaduslikult olla tühi massiiv.
 */
export async function fetchFoxwayFeeds(options: FoxwayFetchOptions = {}): Promise<FoxwayFeedResult[]> {
  const results: FoxwayFeedResult[] = [];
  for (const feed of FOXWAY_FEEDS) results.push(await fetchFoxwayFeed(feed, options));
  return results;
}

import "server-only";
import { HttpRequestError, fetchWithRetry } from "@/server/http/fetch-with-retry";
import { FoxwayConfigError, readFoxwayConfig } from "./foxway-config";
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
 */

const TIMEOUT_MS = 30_000;
const MAX_BYTES = 20 * 1024 * 1024;

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
  bytes: number;
  durationMs: number;
}

export interface FoxwayFetchOptions {
  fetchImpl?: typeof fetch;
  env?: Record<string, string | undefined>;
  sleep?: (ms: number) => Promise<void>;
}

export function pricelistUrl(baseUrl: string, feed: Pick<FoxwayFeed, "catalog" | "itemGroupId">): string {
  const params = new URLSearchParams({ dimensionGroupId: String(FOXWAY_LAPTOP_DIMENSION_GROUP), itemGroupId: String(feed.itemGroupId) });
  return `${baseUrl}/api/v1/catalogs/${encodeURIComponent(feed.catalog)}/pricelist?${params}`;
}

/** Üks hinnakirja päring (üks kataloog × üks ItemGroup). Kõik vead → FoxwaySourceError (võtmeta sõnumiga). */
export async function fetchFoxwayFeed(feed: FoxwayFeed, options: FoxwayFetchOptions = {}): Promise<FoxwayFeedResult> {
  let config;
  try {
    config = readFoxwayConfig(options.env);
  } catch (error) {
    if (error instanceof FoxwayConfigError) throw new FoxwaySourceError("NOT_CONFIGURED", error.message, feed.key);
    throw error;
  }
  const started = Date.now();
  let response: Response;
  try {
    response = await fetchWithRetry(
      pricelistUrl(config.baseUrl, feed),
      { cache: "no-store", redirect: "error", headers: { "X-ApiKey": config.apiKey, Accept: "application/json", "Accept-Encoding": "gzip" } },
      { timeoutMs: TIMEOUT_MS, maxRetries: 2, baseDelayMs: 1_500, fetchImpl: options.fetchImpl, sleep: options.sleep },
    );
  } catch (error) {
    throw new FoxwaySourceError("NETWORK", `${feed.label}: ${error instanceof HttpRequestError ? error.message : "võrguviga"}`, feed.key);
  }
  if (response.status === 401 || response.status === 403) {
    await response.body?.cancel().catch(() => undefined);
    throw new FoxwaySourceError("AUTH", `${feed.label}: HTTP ${response.status} — API võti puudub, on vale või aegunud`, feed.key);
  }
  if (!response.ok) {
    await response.body?.cancel().catch(() => undefined);
    throw new FoxwaySourceError("HTTP", `${feed.label}: HTTP ${response.status}`, feed.key);
  }
  if (Number(response.headers.get("content-length") ?? 0) > MAX_BYTES) {
    await response.body?.cancel().catch(() => undefined);
    throw new FoxwaySourceError("TOO_LARGE", `${feed.label}: vastus on liiga suur`, feed.key);
  }
  const text = await response.text();
  if (text.length > MAX_BYTES) throw new FoxwaySourceError("TOO_LARGE", `${feed.label}: vastus on liiga suur`, feed.key);
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
  return { feed, pricelist, bytes: text.length, durationMs: Date.now() - started };
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

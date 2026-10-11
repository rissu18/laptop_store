import "server-only";
import { HttpRequestError, fetchWithRetry } from "@/server/http/fetch-with-retry";
import { LaptopidConfigError, readLaptopidConfig } from "./laptopid-config";

export { isLaptopidConfigured } from "./laptopid-config";

/**
 * Laptopid.ee API klient — AINULT serveris. API võti (LAPTOPID_API_KEY) läheb ainult HTTP päisesse
 * ja ainult seadistatud aadressile; seda ei logita, ei panda URL-i ega saadeta brauserisse.
 *
 * Otspunktid: LAPTOPID_API_BASE_URL + products.php / images.php (vt laptopid-config.ts) — see on AINUS koht,
 * kust sync, admini diagnostika jm Laptopid päringud URL-id saavad. Vastused on `Cache-Control: no-store`
 * ning siin ei lisata vahemälu — iga sync loeb värske snapshot'i.
 */

const MAX_BODY_BYTES = 20 * 1024 * 1024;

export type LaptopidApiErrorCode = "NOT_CONFIGURED" | "AUTH" | "HTTP" | "NETWORK" | "INVALID_JSON" | "TOO_LARGE";

export class LaptopidApiError extends Error {
  constructor(
    public readonly code: LaptopidApiErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "LaptopidApiError";
  }
}

export interface LaptopidRawResponse {
  products: unknown;
  images: unknown;
  fetchedAt: Date;
  durationMs: number;
}

async function getJson(name: "products" | "images", url: string, apiKey: string, fetchImpl?: typeof fetch): Promise<unknown> {
  let response: Response;
  try {
    response = await fetchWithRetry(
      url,
      { headers: { "X-API-Key": apiKey, Accept: "application/json" }, cache: "no-store", redirect: "error" },
      { timeoutMs: 20_000, maxRetries: 2, baseDelayMs: 500, fetchImpl },
    );
  } catch (error) {
    throw new LaptopidApiError("NETWORK", error instanceof HttpRequestError ? error.message : "Võrguviga");
  }
  if (response.status === 401 || response.status === 403) {
    await response.body?.cancel().catch(() => undefined);
    throw new LaptopidApiError("AUTH", `${name}: autentimine ebaõnnestus (HTTP ${response.status})`);
  }
  if (!response.ok) {
    await response.body?.cancel().catch(() => undefined);
    throw new LaptopidApiError("HTTP", `${name}: HTTP ${response.status}`);
  }
  const length = Number(response.headers.get("content-length") ?? 0);
  if (length > MAX_BODY_BYTES) throw new LaptopidApiError("TOO_LARGE", `${name}: vastus on liiga suur`);
  const text = await response.text();
  if (text.length > MAX_BODY_BYTES) throw new LaptopidApiError("TOO_LARGE", `${name}: vastus on liiga suur`);
  try {
    return JSON.parse(text);
  } catch {
    throw new LaptopidApiError("INVALID_JSON", `${name}: vastus ei ole JSON`);
  }
}

/** Loeb toodete ja piltide nimekirja paralleelselt. Kumbki viga → kogu snapshot ebaõnnestub. */
export async function fetchLaptopidRaw(options: { fetchImpl?: typeof fetch; env?: Record<string, string | undefined> } = {}): Promise<LaptopidRawResponse> {
  let config;
  try {
    config = readLaptopidConfig(options.env);
  } catch (error) {
    if (error instanceof LaptopidConfigError) throw new LaptopidApiError("NOT_CONFIGURED", error.message);
    throw error;
  }
  const { apiKey, endpoints } = config;
  const started = Date.now();
  const [products, images] = await Promise.all([
    getJson("products", endpoints.productsUrl, apiKey, options.fetchImpl),
    getJson("images", endpoints.imagesUrl, apiKey, options.fetchImpl),
  ]);
  return { products, images, fetchedAt: new Date(), durationMs: Date.now() - started };
}

import "server-only";
import { HttpRequestError, fetchWithRetry } from "@/server/http/fetch-with-retry";

/**
 * Laptopid.ee API klient — AINULT serveris. API võti (LAPTOPID_API_KEY) läheb ainult HTTP päisesse
 * ja ainult laptopid.ee aadressile; seda ei logita, ei panda URL-i ega saadeta brauserisse.
 *
 * Otspunktid (kontrollitud päris API-ga): products.php ja images.php. Vastused on `Cache-Control: no-store`
 * ning siin ei lisata vahemälu — iga sync loeb värske snapshot'i.
 */

export const LAPTOPID_PRODUCTS_URL = "https://laptopid.ee/api/sulearvutid/products.php";
export const LAPTOPID_IMAGES_URL = "https://laptopid.ee/api/sulearvutid/images.php";

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

export function isLaptopidConfigured(): boolean {
  return Boolean(process.env.LAPTOPID_API_KEY?.trim());
}

async function getJson(url: string, apiKey: string, fetchImpl?: typeof fetch): Promise<unknown> {
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
  const name = url.endsWith("images.php") ? "images" : "products";
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
export async function fetchLaptopidRaw(options: { fetchImpl?: typeof fetch } = {}): Promise<LaptopidRawResponse> {
  const apiKey = process.env.LAPTOPID_API_KEY?.trim();
  if (!apiKey) throw new LaptopidApiError("NOT_CONFIGURED", "LAPTOPID_API_KEY puudub");
  const started = Date.now();
  const [products, images] = await Promise.all([getJson(LAPTOPID_PRODUCTS_URL, apiKey, options.fetchImpl), getJson(LAPTOPID_IMAGES_URL, apiKey, options.fetchImpl)]);
  return { products, images, fetchedAt: new Date(), durationMs: Date.now() - started };
}

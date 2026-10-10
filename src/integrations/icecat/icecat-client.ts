import "server-only";
import { createLogger } from "@/server/logging/logger";
import { HttpRequestError, fetchWithRetry } from "@/server/http/fetch-with-retry";
import {
  describeIdentifier,
  icecatProductSchema,
  type IcecatIdentifier,
  type IcecatLookupResult,
} from "./icecat-types";

/**
 * Icecati JSON API klient. Kasutatakse AINULT serveris (import "server-only" keelab
 * selle mooduli sattumise brauseri koodi).
 *
 * Autentimine:
 * - `username` (Open Icecat kasutajanimi) läheb URL-i parameetrina `shopname` — see pole saladus.
 * - `apiToken` ja `contentToken` (kui on) saadetakse AINULT päistes `api-token` ja `content-token`.
 *   Neid ei panda kunagi URL-i ega logisse.
 */

const API_URL = "https://live.icecat.biz/api";

export interface IcecatClientConfig {
  username: string;
  apiToken?: string;
  contentToken?: string;
  lang?: string;
  timeoutMs?: number;
  maxRetries?: number;
  fetchImpl?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
}

const log = createLogger("icecat");

/** Icecati veakoodid (ContentErrors / StatusCode), mis tähendavad "toodet pole". */
const NOT_FOUND_MESSAGE = /not found|not yet released|missing information|not in database|incorrect/i;
const RESTRICTED_MESSAGE = /restricted|not whitelisted|app_key|access/i;

export class IcecatClient {
  constructor(private readonly config: IcecatClientConfig) {
    if (!config.username) throw new Error("ICECAT_USERNAME puudub");
  }

  /** Päringu päised. Eraldi meetod, et testides kontrollida, et token on päises, mitte URL-is. */
  headers(): Record<string, string> {
    const headers: Record<string, string> = { Accept: "application/json" };
    if (this.config.apiToken) headers["api-token"] = this.config.apiToken;
    if (this.config.contentToken) headers["content-token"] = this.config.contentToken;
    return headers;
  }

  /** Piltide allalaadimise päised (content token annab ligipääsu kaitstud varadele). */
  assetHeaders(): Record<string, string> {
    return this.config.contentToken ? { "content-token": this.config.contentToken } : {};
  }

  buildUrl(identifier: IcecatIdentifier): string {
    const params = new URLSearchParams({ lang: this.config.lang ?? "en", shopname: this.config.username, content: "" });
    if (identifier.kind === "GTIN") params.set("GTIN", identifier.gtin);
    else if (identifier.kind === "MPN") {
      params.set("Brand", identifier.brand);
      params.set("ProductCode", identifier.mpn);
    } else params.set("icecat_id", identifier.icecatId);
    return `${API_URL}?${params.toString()}`;
  }

  async getProduct(identifier: IcecatIdentifier): Promise<IcecatLookupResult> {
    const description = describeIdentifier(identifier);
    let response: Response;
    try {
      response = await fetchWithRetry(
        this.buildUrl(identifier),
        { headers: this.headers() },
        {
          timeoutMs: this.config.timeoutMs ?? 20_000,
          maxRetries: this.config.maxRetries ?? 3,
          baseDelayMs: 800,
          fetchImpl: this.config.fetchImpl,
          sleep: this.config.sleep,
          onRetry: (info) => log.warn("Icecati päring, uus katse", { identifier: description, ...info }),
        },
      );
    } catch (error) {
      const message = error instanceof HttpRequestError ? error.message : String(error);
      log.error("Icecati päring ebaõnnestus", { identifier: description, error: message });
      return { status: "ERROR", message };
    }

    let body: unknown;
    try {
      body = await response.json();
    } catch {
      return { status: "ERROR", message: `Vigane JSON (HTTP ${response.status})` };
    }

    if (!response.ok) {
      const message = String((body as { Message?: unknown })?.Message ?? `HTTP ${response.status}`);
      if (response.status === 403 || RESTRICTED_MESSAGE.test(message)) return { status: "RESTRICTED", message };
      if (response.status === 404 || response.status === 400 || NOT_FOUND_MESSAGE.test(message)) return { status: "NOT_FOUND", message };
      return { status: "ERROR", message };
    }

    const parsed = icecatProductSchema.safeParse((body as { data?: unknown })?.data);
    if (!parsed.success) {
      log.error("Icecati vastus ei vasta oodatud skeemile", { identifier: description, issue: parsed.error.issues[0]?.message });
      return { status: "ERROR", message: "Ootamatu vastuse struktuur" };
    }
    return { status: "FOUND", product: parsed.data };
  }
}

/** Klient keskkonnamuutujatest. Tagastab null, kui Icecat pole seadistatud. */
export function createIcecatClientFromEnv(env: NodeJS.ProcessEnv = process.env): IcecatClient | null {
  const username = env.ICECAT_USERNAME?.trim();
  if (!username) return null;
  return new IcecatClient({
    username,
    apiToken: env.ICECAT_API_TOKEN?.trim() || undefined,
    contentToken: env.ICECAT_CONTENT_TOKEN?.trim() || undefined,
  });
}

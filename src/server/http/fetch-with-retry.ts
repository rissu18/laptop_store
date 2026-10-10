/**
 * HTTP päring koos timeout'i ja piiratud retry'ga (eksponentsiaalne ooteaeg + juhuslikkus).
 * Retry tehakse AINULT ajutiste vigade korral (võrguviga, timeout, 429, 5xx).
 * 4xx vastuseid (nt 404 "toodet pole") ei korrata — need ei parane kordamisest.
 */

export interface RetryOptions {
  timeoutMs: number;
  maxRetries: number;
  baseDelayMs: number;
  fetchImpl?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
  onRetry?: (info: { attempt: number; delayMs: number; reason: string }) => void;
}

export class HttpRequestError extends Error {
  constructor(
    message: string,
    public readonly retryable: boolean,
  ) {
    super(message);
    this.name = "HttpRequestError";
  }
}

const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export function isRetryableStatus(status: number): boolean {
  return status === 408 || status === 429 || status >= 500;
}

export async function fetchWithRetry(url: string, init: RequestInit, options: RetryOptions): Promise<Response> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const sleep = options.sleep ?? defaultSleep;

  for (let attempt = 0; ; attempt++) {
    let reason: string;
    try {
      const response = await fetchImpl(url, { ...init, signal: AbortSignal.timeout(options.timeoutMs) });
      if (!isRetryableStatus(response.status)) return response;
      reason = `HTTP ${response.status}`;
      // Keha tuleb ära lugeda, et ühendus vabaneks
      await response.body?.cancel().catch(() => undefined);
    } catch (error) {
      reason = error instanceof Error ? `${error.name}: ${error.message}` : "tundmatu viga";
    }

    if (attempt >= options.maxRetries) {
      throw new HttpRequestError(`Päring ebaõnnestus pärast ${attempt + 1} katset (${reason})`, true);
    }
    const delayMs = Math.round(options.baseDelayMs * 2 ** attempt * (0.75 + Math.random() * 0.5));
    options.onRetry?.({ attempt: attempt + 1, delayMs, reason });
    await sleep(delayMs);
  }
}

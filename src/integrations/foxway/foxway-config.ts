/**
 * Foxway API seadistus (vt docs/FOXWAY_SYNC.md):
 *   FOXWAY_API_BASE_URL — Config, nt https://foxway.shop
 *   FOXWAY_API_KEY      — SALADUS (päis X-ApiKey). Ei logita, ei kuvata, ei panda veateadetesse ega brauserisse.
 * Puuduv/vigane seadistus → sync ei käivitu (NOT_CONFIGURED, cron 503), pood töötab edasi.
 */

export class FoxwayConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "FoxwayConfigError";
  }
}

export interface FoxwayConfig {
  baseUrl: string;
  apiKey: string;
}

export function readFoxwayConfig(env: Record<string, string | undefined> = process.env): FoxwayConfig {
  const rawBase = env.FOXWAY_API_BASE_URL?.trim();
  const apiKey = env.FOXWAY_API_KEY?.trim();
  if (!rawBase) throw new FoxwayConfigError("FOXWAY_API_BASE_URL puudub");
  if (!apiKey) throw new FoxwayConfigError("FOXWAY_API_KEY puudub");
  if (apiKey.length < 16 || /\s/.test(apiKey)) throw new FoxwayConfigError("FOXWAY_API_KEY on vigasel kujul");
  let url: URL;
  try {
    url = new URL(rawBase);
  } catch {
    throw new FoxwayConfigError("FOXWAY_API_BASE_URL ei ole kehtiv URL");
  }
  // Võti saadetakse ainult HTTPS-iga ja ilma URL-i sisse kirjutatud kasutajata
  if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash) {
    throw new FoxwayConfigError("FOXWAY_API_BASE_URL peab olema https:// aadress (ilma parameetriteta)");
  }
  return { baseUrl: `${url.origin}${url.pathname.replace(/\/+$/, "")}`, apiKey };
}

export function isFoxwayConfigured(env: Record<string, string | undefined> = process.env): boolean {
  try {
    readFoxwayConfig(env);
    return true;
  } catch {
    return false;
  }
}

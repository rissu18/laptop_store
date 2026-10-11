import { tallinnHour } from "@/domain/time/tallinn";

/**
 * Kataloogi sync'i värskus admini jaoks (admin → Tarnijad). Puhas funktsioon: aeg tuleb kutsujalt.
 * Ainult admin — poes kliendile seda ei kuvata.
 */

/**
 * Automaatne sync (QStash, Europe/Tallinn): päeval 08:00–23:30 iga 30 min, öösel 00:00–06:00 iga 2 h
 * (vt docs/LAPTOPID_SYNC.md). Hoiatuse piir = intervall + varu, et üks väike hilinemine valehäiret ei annaks:
 *   päev (08:00 ≤ Eesti aeg < 00:00) → üle 45 min vana edukas sync = ajastaja ei tööta;
 *   öö   (00:00 ≤ Eesti aeg < 08:00) → üle 150 min.
 */
export const SYNC_STALE_DAY_MS = 45 * 60_000;
export const SYNC_STALE_NIGHT_MS = 150 * 60_000;
/** Eesti kohalik tund, millest algab päevane (tihedam) ajastus */
export const SYNC_DAY_START_HOUR = 8;

export const SYNC_STALE_MESSAGE = "Automaatne sünkroonimine ei ole ajakohane.";

/** Hoiatuse piir antud hetkel Eesti kohaliku aja järgi. */
export function syncStaleAfterMs(now: Date): number {
  return tallinnHour(now) >= SYNC_DAY_START_HOUR ? SYNC_STALE_DAY_MS : SYNC_STALE_NIGHT_MS;
}

export interface SyncHealth {
  lastSuccessAt: Date | null;
  /** Viimasest edukast sync'ist möödunud aeg (ms); null, kui edukat sync'i pole */
  ageMs: number | null;
  ageLabel: string | null;
  /** Praegu kehtiv hoiatuse piir (ms) */
  staleAfterMs: number;
  stale: boolean;
}

export function syncHealth(lastSuccessAt: Date | string | null | undefined, now: Date, staleAfterMs = syncStaleAfterMs(now)): SyncHealth {
  if (!lastSuccessAt) return { lastSuccessAt: null, ageMs: null, ageLabel: null, staleAfterMs, stale: true };
  const at = new Date(lastSuccessAt);
  const ageMs = Math.max(0, now.getTime() - at.getTime());
  return { lastSuccessAt: at, ageMs, ageLabel: formatAge(ageMs), staleAfterMs, stale: ageMs > staleAfterMs };
}

/** "alla minuti" · "12 min tagasi" · "3 h 5 min tagasi" · "2 päeva tagasi" */
export function formatAge(ageMs: number): string {
  const minutes = Math.floor(ageMs / 60_000);
  if (minutes < 1) return "alla minuti tagasi";
  if (minutes < 60) return `${minutes} min tagasi`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return minutes % 60 === 0 ? `${hours} h tagasi` : `${hours} h ${minutes % 60} min tagasi`;
  const days = Math.floor(hours / 24);
  return days === 1 ? "1 päev tagasi" : `${days} päeva tagasi`;
}

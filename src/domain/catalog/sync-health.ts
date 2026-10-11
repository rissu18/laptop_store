/**
 * Kataloogi sync'i värskus admini jaoks (admin → Tarnijad). Puhas funktsioon: aeg tuleb kutsujalt.
 * Ainult admin — poes kliendile seda ei kuvata.
 */

/** Automaatne sync on mõeldud käima iga ~5 min; üle 15 min vana edukas sync = ajastaja ei tööta. */
export const SYNC_STALE_AFTER_MS = 15 * 60_000;

export const SYNC_STALE_MESSAGE = "Automaatne sünkroonimine ei ole ajakohane.";

export interface SyncHealth {
  lastSuccessAt: Date | null;
  /** Viimasest edukast sync'ist möödunud aeg (ms); null, kui edukat sync'i pole */
  ageMs: number | null;
  ageLabel: string | null;
  stale: boolean;
}

export function syncHealth(lastSuccessAt: Date | string | null | undefined, now: Date, staleAfterMs = SYNC_STALE_AFTER_MS): SyncHealth {
  if (!lastSuccessAt) return { lastSuccessAt: null, ageMs: null, ageLabel: null, stale: true };
  const at = new Date(lastSuccessAt);
  const ageMs = Math.max(0, now.getTime() - at.getTime());
  return { lastSuccessAt: at, ageMs, ageLabel: formatAge(ageMs), stale: ageMs > staleAfterMs };
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

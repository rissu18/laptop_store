/**
 * Tarnija sync'i logitase (system_logs). Eesmärk: WARN tähendab "vaata üle", mitte "sync lõppes".
 *
 *   FAILED                                         → ERROR
 *   SUCCESS, snapshot pole usaldusväärne           → WARN (puuduvaid ei võetud maha)
 *   SUCCESS + häire (konflikt, tundmatu rikketekst) → WARN
 *   SUCCESS + teadaolev jääk (ülevaatus, vigased read, pildivead …), mis KASVAS võrreldes eelmise eduka sync'iga → WARN
 *   SUCCESS, jääk sama või väiksem                  → INFO (jääk on adminis näha, iga 30 min korduv WARN oleks müra)
 *
 * Eelmise eduka sync'i puudumisel loetakse eelmiseks jäägiks 0 (esimene sync, millel on jääk → WARN).
 */
export type SyncLogLevel = "INFO" | "WARN" | "ERROR";

export function syncLogLevel(input: {
  status: "SUCCESS" | "FAILED";
  trusted?: boolean;
  /** Alati tähelepanu vajavad (nt duplikaatkonfliktid, tundmatud rikketekstid) */
  alerts?: Record<string, number>;
  /** Teadaolev jääk — WARN ainult siis, kui see kasvas */
  backlog?: Record<string, number>;
  /** Eelmise eduka sync'i stats (catalog_sync_runs.stats) */
  previous?: Record<string, unknown> | null;
}): SyncLogLevel {
  if (input.status === "FAILED") return "ERROR";
  if (input.trusted === false) return "WARN";
  if (Object.values(input.alerts ?? {}).some((n) => n > 0)) return "WARN";
  const grew = Object.entries(input.backlog ?? {}).some(([key, n]) => {
    const before = input.previous?.[key];
    return n > (typeof before === "number" ? before : 0);
  });
  return grew ? "WARN" : "INFO";
}

/**
 * Eesti aeg (Europe/Tallinn, suveaeg UTC+3 / talveaeg UTC+2).
 *
 * Andmebaasis on ajad UTC-s (timestamptz). Admin sisestab ja näeb Eesti aega — sõltumata
 * serveri (Vercel = UTC) või brauseri ajavööndist. Kehtivust otsustab alati server UTC kella järgi.
 */
export const STORE_TIME_ZONE = "Europe/Tallinn";

const partsFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: STORE_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hourCycle: "h23",
});

function wallClockParts(date: Date) {
  const parts = Object.fromEntries(partsFormatter.formatToParts(date).map((p) => [p.type, p.value]));
  return { year: +parts.year, month: +parts.month, day: +parts.day, hour: +parts.hour, minute: +parts.minute, second: +parts.second };
}

/** Eesti kohalik tund (0–23) antud hetkel — suve-/talveaeg arvestatud (Intl, mitte fikseeritud nihe). */
export function tallinnHour(date: Date): number {
  return wallClockParts(date).hour;
}

/** Ajavööndi nihe millisekundites antud hetkel (nt +3 h suvel). */
function offsetAt(utcMs: number): number {
  const p = wallClockParts(new Date(utcMs));
  return Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second) - Math.floor(utcMs / 1000) * 1000;
}

const LOCAL_PATTERN = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/;

/**
 * "2026-10-31T23:59" (Eesti aeg, nagu <input type="datetime-local"> annab) → UTC Date.
 * Tühi väärtus → null. Vigane väärtus → "invalid".
 */
export function tallinnLocalToUtc(local: string | null | undefined): Date | null | "invalid" {
  if (!local) return null;
  const match = LOCAL_PATTERN.exec(local.trim());
  if (!match) return "invalid";
  const [, y, mo, d, h, mi] = match.map(Number);
  const asUtc = Date.UTC(y, mo - 1, d, h, mi);
  const check = new Date(asUtc);
  if (check.getUTCMonth() !== mo - 1 || check.getUTCDate() !== d || h > 23 || mi > 59) return "invalid";
  // Kaks iteratsiooni: suveaja vahetuse ümber muutub nihe
  let utc = asUtc - offsetAt(asUtc);
  utc = asUtc - offsetAt(utc);
  return new Date(utc);
}

/** UTC Date → "2026-10-31T23:59" Eesti ajas (datetime-local välja väärtuseks). */
export function toTallinnLocalInput(date: Date | null | undefined): string {
  if (!date) return "";
  const p = wallClockParts(date);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${p.year}-${pad(p.month)}-${pad(p.day)}T${pad(p.hour)}:${pad(p.minute)}`;
}

const displayFormatter = new Intl.DateTimeFormat("et-EE", { timeZone: STORE_TIME_ZONE, day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
const shortFormatter = new Intl.DateTimeFormat("et-EE", { timeZone: STORE_TIME_ZONE, day: "2-digit", month: "2-digit" });

/** "31.10.2026 23:59" */
export function formatTallinnDateTime(date: Date | string | null | undefined): string | null {
  return date ? displayFormatter.format(new Date(date)) : null;
}

/** "31.10" */
export function formatTallinnShortDate(date: Date | string | null | undefined): string | null {
  return date ? shortFormatter.format(new Date(date)) : null;
}

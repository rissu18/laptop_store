import { formatEur } from "@/domain/money/money";

/** Admini vaadete vormindus. null → null (komponent näitab "Puudub"), mitte väljamõeldud väärtus. */
const dateTime = new Intl.DateTimeFormat("et-EE", { dateStyle: "short", timeStyle: "short", timeZone: "Europe/Tallinn" });

export const fmtDateTime = (value: Date | string | null | undefined) => (value ? dateTime.format(new Date(value)) : null);
export const fmtCents = (value: number | null | undefined) => (value === null || value === undefined ? null : formatEur(value));
export const fmtBool = (value: boolean | null | undefined) => (value === null || value === undefined ? null : value ? "Jah" : "Ei");
export const fmtGb = (value: number | null | undefined) =>
  value === null || value === undefined ? null : value >= 1024 && value % 1024 === 0 ? `${value / 1024} TB` : `${value} GB`;

/** Väärtus vormi välja vaikeväärtuseks (string). */
export function toInput(value: unknown, kind?: "euro"): string {
  if (value === null || value === undefined) return "";
  if (kind === "euro" && typeof value === "number") {
    const euros = (value / 100).toFixed(2).replace(".", ",");
    return euros.endsWith(",00") ? euros.slice(0, -3) : euros;
  }
  return String(value);
}

/** Tarnija väärtus kuvamiseks vormi juures. */
export function toDisplay(value: unknown, kind?: "euro"): string | null {
  if (value === null || value === undefined || value === "") return null;
  if (kind === "euro" && typeof value === "number") return formatEur(value);
  if (typeof value === "boolean") return value ? "Jah" : "Ei";
  return String(value);
}

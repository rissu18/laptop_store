/** URL-i otsinguparameetrite turvaline lugemine (sisend on kasutaja kontrolli all). */
type Raw = string | string[] | undefined;

export function str(value: Raw, max = 100): string | undefined {
  const v = Array.isArray(value) ? value[0] : value;
  const trimmed = v?.trim().slice(0, max);
  return trimmed ? trimmed : undefined;
}

export function oneOf<T extends string>(value: Raw, allowed: readonly T[]): T | undefined {
  const v = str(value);
  return v && (allowed as readonly string[]).includes(v) ? (v as T) : undefined;
}

export function pageNumber(value: Raw): number {
  const n = Number(str(value));
  return Number.isInteger(n) && n > 0 && n < 100_000 ? n : 1;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function uuidParam(value: Raw): string | undefined {
  const v = str(value);
  return v && UUID.test(v) ? v : undefined;
}

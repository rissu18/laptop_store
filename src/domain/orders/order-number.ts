/**
 * Avalik tellimuse number, nt "SL-26-A7K4P9": eesliide, aasta kaks numbrit ja 6 juhuslikku märki
 * ilma segiaetavate märkideta (0/O, 1/I/L). ~887 miljonit kombinatsiooni aastas → raske ära arvata
 * ja ei reeda tellimuste arvu (erinevalt järjekorranumbrist 1, 2, 3 …). Unikaalsuse tagab andmebaas.
 */
const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

export function generateOrderNumber(now = new Date()): string {
  const limit = 256 - (256 % ALPHABET.length);
  let random = "";
  while (random.length < 6) {
    const bytes = new Uint8Array(12);
    globalThis.crypto.getRandomValues(bytes);
    for (const byte of bytes) if (byte < limit && random.length < 6) random += ALPHABET[byte % ALPHABET.length];
  }
  return `SL-${String(now.getUTCFullYear()).slice(-2)}-${random}`;
}

const PATTERN = /^SL-\d{2}-[A-Z2-9]{6}$/;

/** Kasutaja sisestatud number → võrreldav kuju ("sl-26-a7k4p9 " → "SL-26-A7K4P9"); vigane → null. */
export function normalizeOrderNumber(input: string): string | null {
  const value = input.trim().toUpperCase();
  return PATTERN.test(value) ? value : null;
}

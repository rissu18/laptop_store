/**
 * Sooduskoodi tekst.
 *
 * - `code` = admini sisestatud kuju (kuvamiseks), nt "Sügis10"
 * - `normalizedCode` = võrdlemiseks: tühikud otstest maha, Unicode NFKC, suurtähed → "SÜGIS10"
 *
 * Andmebaasis on `normalized_code` UNIQUE, seega "KOOL75", "kool75" ja " Kool75 " on üks ja sama kood.
 */

export const CODE_MIN_LENGTH = 3;
export const CODE_MAX_LENGTH = 40;

/** Lubatud: tähed (ka õ, ä, ö, ü, š, ž), numbrid, sidekriips ja alakriips. Tühikuid koodi sees pole. */
const CODE_PATTERN = /^[\p{L}\p{N}_-]+$/u;

export function normalizeCode(input: string): string {
  return input.normalize("NFKC").trim().toLocaleUpperCase("et-EE");
}

/** Tagastab veateate või null. */
export function validateCodeFormat(input: string): string | null {
  const code = input.normalize("NFKC").trim();
  if (code.length < CODE_MIN_LENGTH) return `Kood peab olema vähemalt ${CODE_MIN_LENGTH} märki`;
  if (code.length > CODE_MAX_LENGTH) return `Kood võib olla kuni ${CODE_MAX_LENGTH} märki`;
  if (!CODE_PATTERN.test(code)) return "Koodis võivad olla ainult tähed, numbrid, sidekriips (-) ja alakriips (_)";
  return null;
}

/** Ilma kergesti segiaetavate märkideta (0/O, 1/I/L). */
const GENERATED_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

/**
 * Juhuslik kood, nt "SAVE-X7K4P2". Kasutab krüptograafilist juhuslikkust (töötab nii serveris kui brauseris).
 * Unikaalsuse tagab andmebaas (normalized_code UNIQUE) — kokkupõrke korral genereeritakse uus.
 */
export function generateCode(prefix = "SAVE", length = 6): string {
  // Tagasilükkamisega valim: baidid ≥ 248 (= 8 × 31) jäetakse vahele, et kõik märgid oleks võrdse tõenäosusega
  const limit = 256 - (256 % GENERATED_ALPHABET.length);
  let random = "";
  while (random.length < length) {
    const bytes = new Uint8Array(length * 2);
    globalThis.crypto.getRandomValues(bytes);
    for (const byte of bytes) if (byte < limit && random.length < length) random += GENERATED_ALPHABET[byte % GENERATED_ALPHABET.length];
  }
  return `${normalizeCode(prefix)}-${random}`;
}

/** Duplikaadi kood: "KOOL75" → "KOOL75-COPY", "KOOL75-COPY" → "KOOL75-COPY2" … */
export function copyCodeCandidates(code: string): string[] {
  const base = normalizeCode(code).replace(/-COPY\d*$/, "").slice(0, CODE_MAX_LENGTH - 7);
  return [`${base}-COPY`, ...Array.from({ length: 8 }, (_, i) => `${base}-COPY${i + 2}`)];
}

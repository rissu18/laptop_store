import { randomBytes, scrypt, timingSafeEqual } from "node:crypto";

/**
 * Paroolide räsimine: scrypt (Node.js sisseehitatud, mälumahukas → GPU-rünnakutele vastupidav).
 * Salvestusformaat: scrypt$N$r$p$<sool base64>$<räsi base64> — parameetrid on räsi sees, et neid saaks
 * hiljem tõsta ilma vanu paroole kehtetuks tegemata.
 * Parooli ennast ei salvestata ega logita kunagi.
 */

const N = 2 ** 15;
const R = 8;
const P = 1;
const KEY_LENGTH = 64;

export const PASSWORD_MIN_LENGTH = 12;
export const PASSWORD_MAX_LENGTH = 200;

function derive(password: string, salt: Buffer, params: { N: number; r: number; p: number; keyLength: number }): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(
      password.normalize("NFKC"),
      salt,
      params.keyLength,
      { N: params.N, r: params.r, p: params.p, maxmem: 256 * params.N * params.r },
      (error, key) => (error ? reject(error) : resolve(key)),
    );
  });
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await derive(password, salt, { N, r: R, p: P, keyLength: KEY_LENGTH });
  return ["scrypt", N, R, P, salt.toString("base64"), key.toString("base64")].join("$");
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const parts = stored.split("$");
  if (parts.length !== 6 || parts[0] !== "scrypt") return false;
  const [, n, r, p, saltB64, keyB64] = parts;
  const expected = Buffer.from(keyB64, "base64");
  if (expected.length < 32) return false;
  const actual = await derive(password, Buffer.from(saltB64, "base64"), { N: Number(n), r: Number(r), p: Number(p), keyLength: expected.length });
  return timingSafeEqual(actual, expected);
}

/** Räsi, mille vastu kontrollitakse olematu kasutaja puhul — vastuse aeg ei reeda, kas e-post on olemas. */
let dummyHash: Promise<string> | null = null;
export function getDummyHash(): Promise<string> {
  dummyHash ??= hashPassword(randomBytes(16).toString("hex"));
  return dummyHash;
}

/** Parooli nõuded (admin:create). Tagastab veateate või null. */
export function validatePasswordStrength(password: string, email?: string): string | null {
  if (password.length < PASSWORD_MIN_LENGTH) return `Parool peab olema vähemalt ${PASSWORD_MIN_LENGTH} märki`;
  if (password.length > PASSWORD_MAX_LENGTH) return "Parool on liiga pikk";
  if (new Set(password).size < 5) return "Parool on liiga lihtne (liiga vähe erinevaid märke)";
  const lower = password.toLowerCase();
  if (["password", "parool", "admin", "qwerty", "123456"].some((weak) => lower.includes(weak))) return "Parool on liiga lihtne (sisaldab levinud sõna)";
  const localPart = email?.toLowerCase().split("@")[0];
  if (localPart && localPart.length >= 3 && lower.includes(localPart)) return "Parool ei tohi sisaldada e-posti aadressi";
  return null;
}

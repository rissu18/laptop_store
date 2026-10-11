import { createHash, timingSafeEqual } from "node:crypto";

/**
 * Ajastatud sync'i otspunkti kaitse (Vercel Cron saadab `Authorization: Bearer <CRON_SECRET>`).
 * Fail-closed: kui CRON_SECRET puudub, ei käivitu otspunkt kunagi.
 */
export function isCronConfigured(): boolean {
  return (process.env.CRON_SECRET?.trim().length ?? 0) >= 16;
}

export function isAuthorizedCronRequest(authorization: string | null): boolean {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret || secret.length < 16 || !authorization) return false;
  // Võrdlus räsidega: sama pikkus, ajast sõltumatu
  const expected = createHash("sha256").update(`Bearer ${secret}`).digest();
  const actual = createHash("sha256").update(authorization).digest();
  return timingSafeEqual(expected, actual);
}

import { and, count, eq, gte, lt } from "drizzle-orm";
import type { Database } from "@/server/db/client";
import { loginAttempts } from "@/server/db/schema";

/**
 * Sisselogimise piirang (brute force kaitse). Andmed on andmebaasis, seega piirang kehtib ka mitme
 * serverless-instantsi vahel.
 *  - sama e-post: max 5 ebaõnnestunud katset 15 minuti jooksul
 *  - sama IP: max 20 ebaõnnestunud katset 15 minuti jooksul
 */
export const LOGIN_WINDOW_MS = 15 * 60 * 1000;
export const MAX_FAILED_PER_EMAIL = 5;
export const MAX_FAILED_PER_IP = 20;

export async function isLoginBlocked(db: Database, email: string, ip: string, now = new Date()): Promise<boolean> {
  const since = new Date(now.getTime() - LOGIN_WINDOW_MS);
  const failed = (column: typeof loginAttempts.email | typeof loginAttempts.ip, value: string) =>
    db
      .select({ n: count() })
      .from(loginAttempts)
      .where(and(eq(column, value), eq(loginAttempts.success, false), gte(loginAttempts.createdAt, since)));
  const [[byEmail], [byIp]] = await Promise.all([failed(loginAttempts.email, email), failed(loginAttempts.ip, ip)]);
  return byEmail.n >= MAX_FAILED_PER_EMAIL || byIp.n >= MAX_FAILED_PER_IP;
}

export async function recordLoginAttempt(db: Database, email: string, ip: string, success: boolean): Promise<void> {
  await db.insert(loginAttempts).values({ email, ip, success });
  // Vanu kirjeid pole vaja (hoiame ööpäeva jagu analüüsiks)
  await db.delete(loginAttempts).where(lt(loginAttempts.createdAt, new Date(Date.now() - 24 * 60 * 60 * 1000)));
}

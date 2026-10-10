import { createHash, randomBytes } from "node:crypto";
import { and, eq, gt, lt } from "drizzle-orm";
import type { Database } from "@/server/db/client";
import { adminSessions, adminUsers } from "@/server/db/schema";

/**
 * Admini sessioonid andmebaasis. Küpsises on juhuslik 256-bitine token; andmebaasis ainult selle
 * SHA-256 räsi — andmebaasi leke ei võimalda sessioone üle võtta. Logout kustutab sessiooni serveris.
 */
export const SESSION_TTL_MS = 8 * 60 * 60 * 1000; // 8 h
const TOUCH_INTERVAL_MS = 5 * 60 * 1000;

export interface SessionAdmin {
  id: string;
  email: string;
  name: string;
  role: string;
  sessionId: string;
}

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export async function createSessionRecord(db: Database, userId: string, meta: { ip: string | null; userAgent: string | null }, now = new Date()) {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(now.getTime() + SESSION_TTL_MS);
  await db.insert(adminSessions).values({ userId, tokenHash: hashToken(token), expiresAt, ip: meta.ip, userAgent: meta.userAgent?.slice(0, 300) ?? null });
  // Aegunud sessioonide koristus
  await db.delete(adminSessions).where(lt(adminSessions.expiresAt, now));
  return { token, expiresAt };
}

export async function findSessionAdmin(db: Database, token: string, now = new Date()): Promise<SessionAdmin | null> {
  if (!token || token.length > 100) return null;
  const [row] = await db
    .select({
      sessionId: adminSessions.id,
      lastSeenAt: adminSessions.lastSeenAt,
      id: adminUsers.id,
      email: adminUsers.email,
      name: adminUsers.name,
      role: adminUsers.role,
    })
    .from(adminSessions)
    .innerJoin(adminUsers, eq(adminUsers.id, adminSessions.userId))
    .where(and(eq(adminSessions.tokenHash, hashToken(token)), gt(adminSessions.expiresAt, now), eq(adminUsers.isActive, true)))
    .limit(1);
  if (!row) return null;
  if (now.getTime() - row.lastSeenAt.getTime() > TOUCH_INTERVAL_MS) {
    await db.update(adminSessions).set({ lastSeenAt: now }).where(eq(adminSessions.id, row.sessionId));
  }
  return { id: row.id, email: row.email, name: row.name, role: row.role, sessionId: row.sessionId };
}

export async function deleteSessionRecord(db: Database, token: string): Promise<void> {
  await db.delete(adminSessions).where(eq(adminSessions.tokenHash, hashToken(token)));
}

export async function deleteUserSessions(db: Database, userId: string): Promise<void> {
  await db.delete(adminSessions).where(eq(adminSessions.userId, userId));
}

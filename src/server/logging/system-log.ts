import "server-only";
import { randomBytes } from "node:crypto";
import type { LOG_LEVELS, LOG_SOURCES } from "@/server/db/schema";
import { createLogger, redact } from "./logger";

/**
 * Süsteemilogi: kirjutab struktureeritud rea konsooli (Vercel logs) JA andmebaasi tabelisse
 * system_logs (admin → Süsteem → Logid). Andmebaasi kirjutamise viga ei tohi algset tegevust
 * katki teha — see logitakse ainult konsooli.
 *
 * Saladusi ei logita: details läbib redact() ja ühendusstringid eemaldatakse sõnumitest.
 */

export type LogLevel = (typeof LOG_LEVELS)[number];
export type LogSource = (typeof LOG_SOURCES)[number];

const consoleLogger = createLogger("system");

export function newErrorId(): string {
  return randomBytes(4).toString("hex").toUpperCase();
}

export function errorMessage(error: unknown): string {
  const text = error instanceof Error ? error.message : String(error);
  return text.replace(/postgres(ql)?:\/\/[^\s"']+/gi, "[DATABASE_URL]").slice(0, 1000);
}

export async function writeSystemLog(entry: {
  level: LogLevel;
  source: LogSource;
  message: string;
  details?: Record<string, unknown>;
  errorId?: string;
}): Promise<void> {
  const details = entry.details ? (redact(entry.details) as Record<string, unknown>) : undefined;
  const level = entry.level === "ERROR" ? "error" : entry.level === "WARN" ? "warn" : entry.level === "DEBUG" ? "debug" : "info";
  consoleLogger[level](entry.message, { source: entry.source, errorId: entry.errorId, ...details });
  try {
    const { getDb, isDatabaseConfigured } = await import("@/server/db/client");
    if (!isDatabaseConfigured()) return;
    const { systemLogs } = await import("@/server/db/schema");
    await getDb().insert(systemLogs).values({ level: entry.level, source: entry.source, message: entry.message.slice(0, 2000), details, errorId: entry.errorId });
  } catch (error) {
    consoleLogger.error("Süsteemilogi andmebaasi kirjutamine ebaõnnestus", { reason: errorMessage(error) });
  }
}

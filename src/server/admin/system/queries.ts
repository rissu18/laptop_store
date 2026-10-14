import "server-only";
import { and, count, desc, eq, gte, ilike, or, sql, type SQL } from "drizzle-orm";
import { requireAdmin } from "@/server/auth/auth";
import { getDb } from "@/server/db/client";
import { formatTallinnDateTime } from "@/domain/time/tallinn";
import { adminSessions, adminUsers, auditLogs, catalogSyncRuns, icecatMetadata, productImages, productModels, supplierListings, systemLogs } from "@/server/db/schema";

/** Tarnija sync'i allikad (catalog_sync_runs.source) → nimi */
const SYNC_SOURCES: [string, string][] = [["LAPTOPID", "Laptopid.ee"], ["TECH", "Techvision"], ["FOXWAY", "Foxway"]];


const LOG_PAGE_SIZE = 50;
export const TIME_RANGES = { "1h": 3600_000, "24h": 86_400_000, "7d": 7 * 86_400_000, "30d": 30 * 86_400_000 } as const;
export type TimeRange = keyof typeof TIME_RANGES;

export interface ActivityFilters {
  entity?: string;
  entityType?: string;
  action?: string;
  page: number;
}

export async function listActivity(filters: ActivityFilters) {
  await requireAdmin();
  const db = getDb();
  const conditions: SQL[] = [];
  if (filters.entity) conditions.push(eq(auditLogs.entityId, filters.entity));
  if (filters.entityType) conditions.push(eq(auditLogs.entityType, filters.entityType));
  if (filters.action) conditions.push(ilike(auditLogs.action, `${filters.action.replace(/[\\%_]/g, "")}%`));
  const where = conditions.length ? and(...conditions) : undefined;
  const [rows, [{ total }]] = await Promise.all([
    db.select().from(auditLogs).where(where).orderBy(desc(auditLogs.createdAt), desc(auditLogs.id)).limit(LOG_PAGE_SIZE).offset((filters.page - 1) * LOG_PAGE_SIZE),
    db.select({ total: count() }).from(auditLogs).where(where),
  ]);
  return { rows, total, pageCount: Math.max(1, Math.ceil(total / LOG_PAGE_SIZE)) };
}

export interface LogFilters {
  level?: string;
  source?: string;
  range?: TimeRange;
  q?: string;
  page: number;
}

export async function listSystemLogs(filters: LogFilters) {
  await requireAdmin();
  const db = getDb();
  const conditions: SQL[] = [];
  if (filters.level) conditions.push(eq(systemLogs.level, filters.level as "INFO"));
  if (filters.source) conditions.push(eq(systemLogs.source, filters.source as "ADMIN"));
  if (filters.range) conditions.push(gte(systemLogs.createdAt, new Date(Date.now() - TIME_RANGES[filters.range])));
  if (filters.q) {
    const like = `%${filters.q.replace(/[\\%_]/g, "")}%`;
    conditions.push(or(ilike(systemLogs.message, like), ilike(systemLogs.errorId, like))!);
  }
  const where = conditions.length ? and(...conditions) : undefined;
  const [rows, [{ total }]] = await Promise.all([
    db.select().from(systemLogs).where(where).orderBy(desc(systemLogs.createdAt), desc(systemLogs.id)).limit(LOG_PAGE_SIZE).offset((filters.page - 1) * LOG_PAGE_SIZE),
    db.select({ total: count() }).from(systemLogs).where(where),
  ]);
  return { rows, total, pageCount: Math.max(1, Math.ceil(total / LOG_PAGE_SIZE)) };
}

export interface HealthCheck {
  name: string;
  status: "ok" | "warn" | "error";
  detail: string;
}

/** Süsteemi tervis: ainult päriselt mõõdetud väärtused (ühendus, latentsus, migratsioonid, logid). */
export async function getSystemHealth(): Promise<{ checks: HealthCheck[]; facts: { label: string; value: string | null }[] }> {
  await requireAdmin();
  const db = getDb();
  const checks: HealthCheck[] = [];

  const started = performance.now();
  let dbVersion: string | null = null;
  try {
    const result = await db.execute<{ version: string }>(sql`SELECT current_setting('server_version') AS version`);
    dbVersion = result.rows[0]?.version ?? null;
    const ms = Math.round(performance.now() - started);
    checks.push({ name: "Andmebaas", status: ms > 1000 ? "warn" : "ok", detail: `Ühendus töötab · PostgreSQL ${dbVersion ?? "?"} · päring ${ms} ms` });
  } catch {
    checks.push({ name: "Andmebaas", status: "error", detail: "Ühendus ebaõnnestus (vt Logid)" });
    return { checks, facts: [] };
  }

  let migrations = 0;
  try {
    const result = await db.execute<{ n: number }>(sql`SELECT count(*)::int AS n FROM public.__drizzle_migrations`);
    migrations = result.rows[0]?.n ?? 0;
    checks.push({ name: "Migratsioonid", status: migrations > 0 ? "ok" : "warn", detail: `Rakendatud ${migrations} migratsiooni` });
  } catch {
    checks.push({ name: "Migratsioonid", status: "warn", detail: "Migratsioonide tabelit ei leitud" });
  }

  const since = new Date(Date.now() - TIME_RANGES["24h"]);
  const [[errors24h], [warns24h], [activeSessions], [admins], [lastIcecat]] = await Promise.all([
    db.select({ n: count() }).from(systemLogs).where(and(eq(systemLogs.level, "ERROR"), gte(systemLogs.createdAt, since))),
    db.select({ n: count() }).from(systemLogs).where(and(eq(systemLogs.level, "WARN"), gte(systemLogs.createdAt, since))),
    db.select({ n: count() }).from(adminSessions).where(gte(adminSessions.expiresAt, new Date())),
    db.select({ n: count() }).from(adminUsers).where(eq(adminUsers.isActive, true)),
    db.select({ at: sql<Date | null>`max(${icecatMetadata.checkedAt})` }).from(icecatMetadata),
  ]);
  checks.push({ name: "Vead (24 h)", status: errors24h.n > 0 ? "warn" : "ok", detail: `${errors24h.n} viga, ${warns24h.n} hoiatust` });
  checks.push({
    name: "Icecat",
    status: process.env.ICECAT_USERNAME ? "ok" : "warn",
    detail: process.env.ICECAT_USERNAME ? "Seadistatud (otsing ja käsitsi vaste töötavad)" : "Pole selles keskkonnas seadistatud — Icecati toimingud on välja lülitatud",
  });
  checks.push({
    name: "Pildisalvestus",
    status: process.env.VERCEL ? "warn" : "ok",
    detail: process.env.VERCEL ? "Vercel: failisüsteem pole püsiv — pildid tulevad Git'ist, allalaadimine ainult lokaalselt" : "Kohalik (public/media/products)",
  });

  const [[models], [listings], [images], lastSyncs] = await Promise.all([
    db.select({ n: count() }).from(productModels),
    db.select({ n: count() }).from(supplierListings),
    db.select({ n: count() }).from(productImages),
    db
      .select({ source: catalogSyncRuns.source, at: sql<Date | null>`max(${catalogSyncRuns.finishedAt})` })
      .from(catalogSyncRuns)
      .where(eq(catalogSyncRuns.status, "SUCCESS"))
      .groupBy(catalogSyncRuns.source),
  ]);
  const lastSyncBySource = new Map(lastSyncs.map((row) => [row.source, row.at ? new Date(row.at) : null]));
  const lastIcecatAt = lastIcecat.at ? new Date(lastIcecat.at) : null;

  return {
    checks,
    facts: [
      { label: "Keskkond", value: process.env.VERCEL_ENV ?? process.env.NODE_ENV ?? null },
      { label: "Versioon (commit)", value: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? null },
      { label: "Node.js", value: process.version },
      { label: "Mudeleid / konfiguratsioone / pilte", value: `${models.n} / ${listings.n} / ${images.n}` },
      { label: "Aktiivseid admine / sessioone", value: `${admins.n} / ${activeSessions.n}` },
      { label: "Viimane Icecati kontroll", value: lastIcecatAt ? lastIcecatAt.toISOString() : null },
      {
        label: "Viimane edukas tarnija sync",
        value: SYNC_SOURCES.map(([source, name]) => {
          const at = lastSyncBySource.get(source);
          return `${name}: ${at ? formatTallinnDateTime(at) : "pole"}`;
        }).join(" · "),
      },
    ],
  };
}


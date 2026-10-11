import { and, desc, eq, lt } from "drizzle-orm";
import type { Database } from "@/server/db/client";
import { catalogSyncRuns, type SYNC_RUN_TRIGGERS } from "@/server/db/schema";

/**
 * Andmebaasipõhine sync'i lukk: allika kohta võib olla ainult üks RUNNING rida (osaline UNIQUE indeks).
 * Töötab ka mitme serverless-instantsi vahel. Kui funktsioon katkeb (timeout), aegub lukk `lease_until`
 * järel ja järgmine käivitus märgib vana rea FAILED-iks.
 */

export type SyncTrigger = (typeof SYNC_RUN_TRIGGERS)[number];
export type SyncRunRow = typeof catalogSyncRuns.$inferSelect;

export const DEFAULT_LEASE_MS = 5 * 60_000;

export async function acquireSyncRun(
  db: Database,
  input: { source: string; trigger: SyncTrigger; triggeredBy?: string | null; now?: Date; leaseMs?: number },
): Promise<string | null> {
  const now = input.now ?? new Date();
  await db
    .update(catalogSyncRuns)
    .set({ status: "FAILED", finishedAt: now, error: "Lukk aegus (eelmine käivitus katkes)" })
    .where(and(eq(catalogSyncRuns.source, input.source), eq(catalogSyncRuns.status, "RUNNING"), lt(catalogSyncRuns.leaseUntil, now)));
  const rows = await db
    .insert(catalogSyncRuns)
    .values({
      source: input.source,
      status: "RUNNING",
      trigger: input.trigger,
      triggeredBy: input.triggeredBy ?? null,
      startedAt: now,
      leaseUntil: new Date(now.getTime() + (input.leaseMs ?? DEFAULT_LEASE_MS)),
    })
    .onConflictDoNothing()
    .returning({ id: catalogSyncRuns.id });
  return rows[0]?.id ?? null;
}

export async function finishSyncRun(
  db: Database,
  id: string,
  result: { status: "SUCCESS" | "FAILED"; stats: Record<string, unknown>; snapshotTrusted: boolean | null; error: string | null; now?: Date },
): Promise<void> {
  await db
    .update(catalogSyncRuns)
    .set({ status: result.status, stats: result.stats, snapshotTrusted: result.snapshotTrusted, error: result.error, finishedAt: result.now ?? new Date() })
    .where(eq(catalogSyncRuns.id, id));
}

export async function listSyncRuns(db: Pick<Database, "select">, source: string, limit = 10): Promise<SyncRunRow[]> {
  return db.select().from(catalogSyncRuns).where(eq(catalogSyncRuns.source, source)).orderBy(desc(catalogSyncRuns.startedAt)).limit(limit);
}

export async function lastSuccessfulSyncRun(db: Pick<Database, "select">, source: string): Promise<SyncRunRow | null> {
  const [row] = await db
    .select()
    .from(catalogSyncRuns)
    .where(and(eq(catalogSyncRuns.source, source), eq(catalogSyncRuns.status, "SUCCESS")))
    .orderBy(desc(catalogSyncRuns.startedAt))
    .limit(1);
  return row ?? null;
}

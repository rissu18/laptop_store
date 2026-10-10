import type { Database } from "@/server/db/client";
import { auditLogs } from "@/server/db/schema";

/**
 * Audit log: KES muutis MIDA ja MILLAL (vana → uus väärtus). Kirjutatakse samas transaktsioonis
 * muudatusega, seega muudatust ilma auditikirjeta ei teki.
 */
export type AuditChanges = Record<string, { from: unknown; to: unknown }>;

export interface AuditActor {
  id: string;
  email: string;
}

export interface AuditEntry {
  action: string;
  entityType: string;
  entityId?: string | null;
  entityLabel?: string | null;
  changes?: AuditChanges | null;
}

/** Ainult muutunud väljad. */
export function diffChanges(before: Record<string, unknown>, after: Record<string, unknown>): AuditChanges {
  const changes: AuditChanges = {};
  for (const key of Object.keys(after)) {
    const from = before[key] ?? null;
    const to = after[key] ?? null;
    if (JSON.stringify(from) !== JSON.stringify(to)) changes[key] = { from, to };
  }
  return changes;
}

type Executor = Pick<Database, "insert">;

export async function writeAudit(db: Executor, actor: AuditActor | null, entry: AuditEntry): Promise<void> {
  await db.insert(auditLogs).values({
    adminUserId: actor?.id ?? null,
    adminEmail: actor?.email ?? null,
    action: entry.action,
    entityType: entry.entityType,
    entityId: entry.entityId ?? null,
    entityLabel: entry.entityLabel ?? null,
    changes: entry.changes && Object.keys(entry.changes).length ? entry.changes : null,
  });
}

import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { resolveDatabaseUrl, withSecureSsl } from "./database-url";
import * as schema from "./schema";

/**
 * Andmebaasi ühendus (Drizzle + node-postgres).
 * Üks Pool protsessi kohta; arendusrežiimis hoitakse see globalThis'il, et kuumlaadimine ei tekitaks
 * iga muudatusega uut ühenduste kogumit. Serverless'is on väike max, sest Neon'i pooler jagab ühendusi.
 */
export type Database = NodePgDatabase<typeof schema>;

const globalForDb = globalThis as unknown as { __db?: { db: Database; pool: Pool } };

export class DatabaseNotConfiguredError extends Error {
  constructor() {
    super("DATABASE_URL puudub — andmebaas pole seadistatud");
    this.name = "DatabaseNotConfiguredError";
  }
}

export function isDatabaseConfigured(): boolean {
  return resolveDatabaseUrl("pooled") !== null;
}

export function getDb(): Database {
  if (globalForDb.__db) return globalForDb.__db.db;
  const url = resolveDatabaseUrl("pooled");
  if (!url) throw new DatabaseNotConfiguredError();
  const pool = new Pool({ connectionString: withSecureSsl(url), max: 5, idleTimeoutMillis: 10_000, connectionTimeoutMillis: 10_000 });
  const db = drizzle(pool, { schema });
  globalForDb.__db = { db, pool };
  return db;
}

/** Testide ja skriptide jaoks: oma Pool (nt eraldi skeemiga). */
export function createDb(connectionString: string, options: { searchPath?: string } = {}): { db: Database; pool: Pool } {
  const pool = new Pool({
    connectionString: withSecureSsl(connectionString),
    max: 3,
    ...(options.searchPath ? { options: `-c search_path=${options.searchPath}` } : {}),
  });
  return { db: drizzle(pool, { schema }), pool };
}

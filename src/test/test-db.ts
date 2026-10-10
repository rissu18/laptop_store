import { randomBytes } from "node:crypto";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { createDb, type Database } from "@/server/db/client";
import { resolveDatabaseUrl } from "@/server/db/database-url";

/**
 * Andmebaasi testid jooksevad PÄRIS PostgreSQL-is, aga eraldi ajutises skeemis (test_xxxx), mis
 * kustutatakse testi lõpus — poe andmeid (public skeem) testid ei puuduta.
 * Kui DATABASE_URL puudub (nt CI ilma andmebaasita), jäetakse need testid vahele.
 */
for (const file of [".env.development.local", ".env.local"]) {
  if (existsSync(file)) {
    try {
      process.loadEnvFile(file);
    } catch {
      /* fail on vigane — jätame vahele */
    }
  }
}

export const TEST_DATABASE_URL = resolveDatabaseUrl("direct");
export const hasTestDatabase = Boolean(TEST_DATABASE_URL);

export interface TestDatabase {
  db: Database;
  schema: string;
  cleanup: () => Promise<void>;
}

export async function createTestDatabase(): Promise<TestDatabase> {
  if (!TEST_DATABASE_URL) throw new Error("DATABASE_URL puudub");
  const schema = `test_${randomBytes(5).toString("hex")}`;
  const { db, pool } = createDb(TEST_DATABASE_URL, { searchPath: schema });
  await pool.query(`CREATE SCHEMA "${schema}"`);
  const dir = path.join(process.cwd(), "drizzle");
  for (const file of readdirSync(dir).filter((f) => f.endsWith(".sql")).sort()) {
    const sql = readFileSync(path.join(dir, file), "utf8").replaceAll('"public".', `"${schema}".`);
    for (const statement of sql.split("--> statement-breakpoint")) {
      if (statement.trim()) await pool.query(statement);
    }
  }
  return {
    db,
    schema,
    cleanup: async () => {
      await pool.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
      await pool.end();
    },
  };
}

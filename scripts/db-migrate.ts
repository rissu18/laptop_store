/**
 * Rakendab drizzle/ kausta SQL-migratsioonid: npm run db:migrate
 * Kasutab otseühendust (DATABASE_URL_UNPOOLED); migratsioonid on idempotentsed (juba tehtud jäetakse vahele).
 */
import "./lib/load-env";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { createDb } from "@/server/db/client";
import { redactConnectionStrings, resolveDatabaseUrl } from "@/server/db/database-url";

async function main() {
  const url = resolveDatabaseUrl("direct");
  if (!url) throw new Error("DATABASE_URL puudub");
  const { db, pool } = createDb(url);
  try {
    await migrate(db, { migrationsFolder: "./drizzle", migrationsTable: "__drizzle_migrations", migrationsSchema: "public" });
    const { rows } = await pool.query("select count(*)::int as n from information_schema.tables where table_schema = 'public'");
    console.log(`OK: migratsioonid rakendatud · tabeleid: ${rows[0].n}`);
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  console.error("VIGA:", redactConnectionStrings(error instanceof Error ? error.message : String(error)));
  process.exit(1);
});

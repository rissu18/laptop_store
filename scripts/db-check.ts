/** Andmebaasi ühenduse kontroll: npm run db:check (aadressi ei kuvata). */
import "./lib/load-env";
import pg from "pg";
import { redactConnectionStrings, resolveDatabaseUrl, withSecureSsl } from "@/server/db/database-url";

const url = resolveDatabaseUrl("pooled");
if (!url) {
  console.error("VIGA: DATABASE_URL puudub (vt README → Andmebaas)");
  process.exit(1);
}
async function main(connectionString: string) {
  const client = new pg.Client({ connectionString: withSecureSsl(connectionString) });
  try {
  await client.connect();
  const { rows } = await client.query(
    "select current_setting('server_version') as version, (select count(*)::int from information_schema.tables where table_schema = 'public') as tables",
  );
  console.log(`OK: PostgreSQL ${String(rows[0].version).split(" ")[0]} · tabeleid public skeemis: ${rows[0].tables}`);
} catch (error) {
  console.error("VIGA:", redactConnectionStrings(error instanceof Error ? error.message : String(error)));
  process.exitCode = 1;
} finally {
    await client.end().catch(() => undefined);
  }
}

void main(url);

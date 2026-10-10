import { existsSync } from "node:fs";
import { defineConfig } from "drizzle-kit";
import { resolveDatabaseUrl, withSecureSsl } from "./src/server/db/database-url";

// Migratsioonid kasutavad otseühendust (mitte pooler'it). Aadressi ei logita.
for (const file of [".env.development.local", ".env.local"]) if (existsSync(file)) process.loadEnvFile(file);
const url = resolveDatabaseUrl("direct");

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/server/db/schema.ts",
  out: "./drizzle",
  dbCredentials: { url: url ? withSecureSsl(url) : "" },
  migrations: { table: "__drizzle_migrations", schema: "public" },
  strict: true,
  verbose: false,
});

/**
 * Olemasolevate andmete arvud: npm run db:counts
 * Kasutatakse enne ja pärast migratsiooni kontrolliks, et midagi ei kadunud.
 */
import "./lib/load-env";
import { count } from "drizzle-orm";
import { createDb } from "@/server/db/client";
import { redactConnectionStrings, resolveDatabaseUrl } from "@/server/db/database-url";
import { adminUsers, auditLogs, catalogSyncRuns, discountCodes, listingImages, orderItems, orders, productImages, productModels, storeSettings, supplierListings } from "@/server/db/schema";

async function main() {
  const url = resolveDatabaseUrl("direct");
  if (!url) throw new Error("DATABASE_URL puudub");
  const { db, pool } = createDb(url);
  try {
    const tables = { productModels, supplierListings, productImages, listingImages, discountCodes, orders, orderItems, adminUsers, storeSettings, auditLogs, catalogSyncRuns };
    const result: Record<string, number> = {};
    for (const [name, table] of Object.entries(tables)) result[name] = (await db.select({ n: count() }).from(table))[0].n;
    console.log(JSON.stringify(result));
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  console.error("VIGA:", redactConnectionStrings(error instanceof Error ? error.message : String(error)));
  process.exitCode = 1;
});

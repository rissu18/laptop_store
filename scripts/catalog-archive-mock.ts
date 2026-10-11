/**
 * Tootmise ümberlülitus: mock-tarnija (arenduse testandmed) pakkumised → ARCHIVED.
 *   npm run catalog:archive-mock            (ainult näitab, mida muudetaks)
 *   npm run catalog:archive-mock -- --confirm
 * Midagi ei kustutata: read jäävad andmebaasi (vanad tellimused, audit), aga poodi need enam ei jõua.
 * Tagasi: adminis konfiguratsiooni staatus → Aktiivne. Muudatus kirjutatakse tegevuslogisse.
 * Pärast käivitamist vajuta adminis "Sync now" (tühjendab poe vahemälu) või tee deploy.
 */
import "./lib/load-env";
import { and, eq, ne } from "drizzle-orm";
import { createDb } from "@/server/db/client";
import { redactConnectionStrings, resolveDatabaseUrl } from "@/server/db/database-url";
import { auditLogs, supplierListings } from "@/server/db/schema";

const MOCK_SUPPLIER = "mock";

async function main() {
  const url = resolveDatabaseUrl("direct");
  if (!url) throw new Error("DATABASE_URL puudub");
  const { db, pool } = createDb(url);
  try {
    const rows = await db
      .select({ id: supplierListings.id, sku: supplierListings.sku, status: supplierListings.status })
      .from(supplierListings)
      .where(and(eq(supplierListings.supplier, MOCK_SUPPLIER), ne(supplierListings.status, "ARCHIVED")));
    console.log(`Mock-pakkumisi, mis pole arhiveeritud: ${rows.length}`);
    if (!process.argv.includes("--confirm")) {
      console.log("Kuivkäivitus — midagi ei muudetud. Muutmiseks lisa: -- --confirm");
      return;
    }
    await db.transaction(async (tx) => {
      for (const row of rows) {
        await tx.update(supplierListings).set({ status: "ARCHIVED" }).where(eq(supplierListings.id, row.id));
        await tx.insert(auditLogs).values({
          adminEmail: "cli:catalog-archive-mock",
          action: "listing.archive_mock",
          entityType: "SupplierListing",
          entityId: row.id,
          entityLabel: row.sku,
          changes: { status: { from: row.status, to: "ARCHIVED" } },
        });
      }
    });
    console.log(`Arhiveeritud: ${rows.length}`);
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  console.error("VIGA:", redactConnectionStrings(error instanceof Error ? error.message : String(error)));
  process.exit(1);
});

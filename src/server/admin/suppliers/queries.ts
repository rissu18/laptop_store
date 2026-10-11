import "server-only";
import { and, count, eq, ne, sql } from "drizzle-orm";
import { isLaptopidConfigured } from "@/integrations/laptopid/laptopid-client";
import { LAPTOPID_SOURCE, LAPTOPID_SUPPLIER_CODE } from "@/integrations/laptopid/laptopid-normalizer";
import { requireAdmin } from "@/server/auth/auth";
import { lastSuccessfulSyncRun, listSyncRuns } from "@/server/catalog-sync/sync-runs";
import { isCronConfigured } from "@/server/catalog-sync/cron-auth";
import { getDb } from "@/server/db/client";
import { supplierListings } from "@/server/db/schema";

/** Admin → Tarnijad: Laptopid.ee sync'i seis. */
export async function getSupplierOverview() {
  await requireAdmin();
  const db = getDb();
  const [runs, lastSuccess, laptopid, mockActive] = await Promise.all([
    listSyncRuns(db, LAPTOPID_SOURCE, 10),
    lastSuccessfulSyncRun(db, LAPTOPID_SOURCE),
    db
      .select({
        total: count(),
        available: sql<number>`count(*) FILTER (WHERE ${supplierListings.available} IS TRUE)::int`,
        unavailable: sql<number>`count(*) FILTER (WHERE ${supplierListings.available} IS FALSE)::int`,
      })
      .from(supplierListings)
      .where(eq(supplierListings.supplier, LAPTOPID_SUPPLIER_CODE)),
    db
      .select({ n: count() })
      .from(supplierListings)
      .where(and(ne(supplierListings.supplier, LAPTOPID_SUPPLIER_CODE), eq(supplierListings.status, "ACTIVE"))),
  ]);
  return {
    configured: isLaptopidConfigured(),
    cronConfigured: isCronConfigured(),
    runs,
    lastSuccess,
    listings: laptopid[0],
    otherActiveListings: mockActive[0].n,
  };
}

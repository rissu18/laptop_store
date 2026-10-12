import "server-only";
import { and, count, eq, ne, sql } from "drizzle-orm";
import { syncHealth } from "@/domain/catalog/sync-health";
import { isLaptopidConfigured } from "@/integrations/laptopid/laptopid-client";
import { LAPTOPID_SOURCE, LAPTOPID_SUPPLIER_CODE } from "@/integrations/laptopid/laptopid-normalizer";
import { requireAdmin } from "@/server/auth/auth";
import { lastSuccessfulSyncRun, listSyncRuns } from "@/server/catalog-sync/sync-runs";
import { isCronConfigured } from "@/server/catalog-sync/cron-auth";
import { getDb } from "@/server/db/client";
import { supplierInventoryUnits, supplierListings } from "@/server/db/schema";
import { isTechConfigured } from "@/integrations/tech/tech-config";
import { TECH_SOURCE, TECH_SUPPLIER_CODE } from "@/integrations/tech/tech-normalizer";

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
  // Viimane lõppenud käivitus (edukas või mitte) — RUNNING rida pole veel tulemus
  const lastFinished = runs.find((run) => run.status !== "RUNNING") ?? null;
  return {
    configured: isLaptopidConfigured(),
    health: syncHealth(lastSuccess?.finishedAt ?? null, new Date()),
    lastFinished,
    cronConfigured: isCronConfigured(),
    runs,
    lastSuccess,
    listings: laptopid[0],
    otherActiveListings: mockActive[0].n,
  };
}

/** Tech sync käib vähemalt kord ööpäevas (03:00) → üle 26 h vana edukas sync = hoiatus */
const TECH_STALE_AFTER_MS = 26 * 60 * 60_000;

/** Admin → Tarnijad: Tech hinnakirja sync'i seis. */
export async function getTechSupplierOverview() {
  await requireAdmin();
  const db = getDb();
  const [runs, lastSuccess, [listings], [units]] = await Promise.all([
    listSyncRuns(db, TECH_SOURCE, 10),
    lastSuccessfulSyncRun(db, TECH_SOURCE),
    db
      .select({
        total: count(),
        available: sql<number>`count(*) FILTER (WHERE ${supplierListings.available} IS TRUE)::int`,
        stock: sql<number>`coalesce(sum(${supplierListings.stock}) FILTER (WHERE ${supplierListings.available} IS TRUE), 0)::int`,
      })
      .from(supplierListings)
      .where(eq(supplierListings.supplier, TECH_SUPPLIER_CODE)),
    db
      .select({ total: count(), available: sql<number>`count(*) FILTER (WHERE ${supplierInventoryUnits.available})::int` })
      .from(supplierInventoryUnits)
      .where(eq(supplierInventoryUnits.supplier, TECH_SUPPLIER_CODE)),
  ]);
  return {
    configured: isTechConfigured(),
    health: syncHealth(lastSuccess?.finishedAt ?? null, new Date(), TECH_STALE_AFTER_MS),
    lastFinished: runs.find((run) => run.status !== "RUNNING") ?? null,
    runs,
    lastSuccess,
    listings,
    units,
  };
}

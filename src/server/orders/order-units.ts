import { and, asc, eq, inArray, ne } from "drizzle-orm";
import type { Database } from "@/server/db/client";
import { orderItemUnits, orderItems, orders, supplierInventoryUnits } from "@/server/db/schema";

/**
 * Tellimuse rida ↔ tarnija füüsiline seade (seerianumber) — AINULT admin.
 *
 * Selles faasis on see käsitsi märge: admin valib, milline konkreetne seade tellimusele läheb. Seadet EI reserveerita
 * ega märgita müüduks ja tarnijale (Tech hinnakiri) midagi ei saadeta — testtellimus ei kuluta laoseisu.
 * Päris makse faasis tuleb seadme reserveerimine/kulutamine siduda makse kinnitusega samas tehingus (docs/TECH_SYNC.md).
 *
 * Seerianumbrit kliendile ei näidata: avalik tellimuse vaade (public-order.ts) seda tabelit ei loe.
 */

type Tx = Parameters<Parameters<Database["transaction"]>[0]>[0];
type Reader = Pick<Database, "select">;

export interface AssignedUnit {
  assignmentId: string;
  unitId: string;
  externalUnitId: string;
  serialNumber: string | null;
  available: boolean;
  status: string;
  adminEmail: string | null;
  createdAt: Date;
}

export interface CandidateUnit {
  id: string;
  externalUnitId: string;
  serialNumber: string | null;
}

/** Tellimuse ridadele määratud seadmed (rea ID → seadmed) */
export async function loadOrderItemUnits(db: Reader, orderItemIds: string[]): Promise<Map<string, AssignedUnit[]>> {
  const result = new Map<string, AssignedUnit[]>();
  if (!orderItemIds.length) return result;
  const rows = await db
    .select({
      orderItemId: orderItemUnits.orderItemId,
      assignmentId: orderItemUnits.id,
      unitId: supplierInventoryUnits.id,
      externalUnitId: supplierInventoryUnits.externalUnitId,
      serialNumber: supplierInventoryUnits.serialNumber,
      available: supplierInventoryUnits.available,
      status: supplierInventoryUnits.status,
      adminEmail: orderItemUnits.adminEmail,
      createdAt: orderItemUnits.createdAt,
    })
    .from(orderItemUnits)
    .innerJoin(supplierInventoryUnits, eq(orderItemUnits.inventoryUnitId, supplierInventoryUnits.id))
    .where(inArray(orderItemUnits.orderItemId, orderItemIds))
    .orderBy(asc(orderItemUnits.createdAt));
  for (const { orderItemId, ...unit } of rows) result.set(orderItemId, [...(result.get(orderItemId) ?? []), unit]);
  return result;
}

/** Müügis seadmed pakkumise kaupa (valikuks), välja arvatud need, mis on juba mõne teise PÄRIS tellimusega seotud */
export async function loadCandidateUnits(db: Reader, listingIds: string[]): Promise<Map<string, CandidateUnit[]>> {
  const result = new Map<string, CandidateUnit[]>();
  if (!listingIds.length) return result;
  const [units, taken] = await Promise.all([
    db
      .select({ id: supplierInventoryUnits.id, listingId: supplierInventoryUnits.supplierListingId, externalUnitId: supplierInventoryUnits.externalUnitId, serialNumber: supplierInventoryUnits.serialNumber })
      .from(supplierInventoryUnits)
      .where(and(inArray(supplierInventoryUnits.supplierListingId, listingIds), eq(supplierInventoryUnits.available, true)))
      .orderBy(asc(supplierInventoryUnits.externalUnitId)),
    takenByRealOrders(db, null),
  ]);
  for (const unit of units) {
    if (!unit.listingId || taken.has(unit.id)) continue;
    result.set(unit.listingId, [...(result.get(unit.listingId) ?? []), { id: unit.id, externalUnitId: unit.externalUnitId, serialNumber: unit.serialNumber }]);
  }
  return result;
}

/** Seadmed, mis on seotud mõne tühistamata PÄRIS tellimusega (testtellimused ei broneeri midagi) */
async function takenByRealOrders(db: Reader, exceptOrderItemId: string | null): Promise<Set<string>> {
  const rows = await db
    .select({ unitId: orderItemUnits.inventoryUnitId })
    .from(orderItemUnits)
    .innerJoin(orderItems, eq(orderItemUnits.orderItemId, orderItems.id))
    .innerJoin(orders, eq(orderItems.orderId, orders.id))
    .where(and(eq(orders.isTest, false), ne(orders.status, "CANCELLED"), exceptOrderItemId ? ne(orderItems.id, exceptOrderItemId) : undefined));
  return new Set(rows.map((r) => r.unitId));
}

export type AssignResult = { ok: true; orderNumber: string; externalUnitId: string } | { ok: false; error: string };

/**
 * Seob seadme tellimuse reaga (tehingu sees). Kontrollid: rida kuulub tellimusele, seade kuulub sama pakkumise alla,
 * on müügis, pole juba sellel real ega mõne teise päris tellimuse küljes ja määratud seadmeid pole rohkem kui kogus.
 */
export async function assignUnitToOrderItem(
  tx: Tx,
  input: { orderId: string; orderItemId: string; inventoryUnitId: string; admin: { id: string; email: string } },
): Promise<AssignResult> {
  const [item] = await tx.select().from(orderItems).where(and(eq(orderItems.id, input.orderItemId), eq(orderItems.orderId, input.orderId))).for("update");
  if (!item) return { ok: false, error: "Tellimuse rida ei leitud" };
  const [order] = await tx.select({ orderNumber: orders.orderNumber, status: orders.status }).from(orders).where(eq(orders.id, input.orderId));
  if (!order) return { ok: false, error: "Tellimust ei leitud" };
  if (order.status === "CANCELLED") return { ok: false, error: "Tühistatud tellimusele seadmeid ei määrata" };
  const [unit] = await tx.select().from(supplierInventoryUnits).where(eq(supplierInventoryUnits.id, input.inventoryUnitId)).for("update");
  if (!unit) return { ok: false, error: "Seadet ei leitud" };
  if (!item.supplierListingId || unit.supplierListingId !== item.supplierListingId) return { ok: false, error: "Seade ei kuulu selle tellimuse rea konfiguratsiooni alla" };
  if (!unit.available) return { ok: false, error: "Seade ei ole müügis (müüdud, defekt või puudub hinnakirjast)" };
  const assigned = await tx.select({ unitId: orderItemUnits.inventoryUnitId }).from(orderItemUnits).where(eq(orderItemUnits.orderItemId, item.id));
  if (assigned.some((a) => a.unitId === unit.id)) return { ok: false, error: "Seade on sellele reale juba määratud" };
  if (assigned.length >= item.quantity) return { ok: false, error: `Reale on juba määratud ${assigned.length} seadet (kogus ${item.quantity})` };
  if ((await takenByRealOrders(tx, item.id)).has(unit.id)) return { ok: false, error: "Seade on juba seotud teise tellimusega" };
  await tx.insert(orderItemUnits).values({ orderItemId: item.id, inventoryUnitId: unit.id, adminUserId: input.admin.id, adminEmail: input.admin.email });
  return { ok: true, orderNumber: order.orderNumber, externalUnitId: unit.externalUnitId };
}

export async function unassignUnitFromOrderItem(tx: Tx, input: { orderId: string; assignmentId: string }): Promise<AssignResult> {
  const [row] = await tx
    .select({ id: orderItemUnits.id, externalUnitId: supplierInventoryUnits.externalUnitId, orderNumber: orders.orderNumber })
    .from(orderItemUnits)
    .innerJoin(orderItems, eq(orderItemUnits.orderItemId, orderItems.id))
    .innerJoin(orders, eq(orderItems.orderId, orders.id))
    .innerJoin(supplierInventoryUnits, eq(orderItemUnits.inventoryUnitId, supplierInventoryUnits.id))
    .where(and(eq(orderItemUnits.id, input.assignmentId), eq(orders.id, input.orderId)));
  if (!row) return { ok: false, error: "Määrangut ei leitud" };
  await tx.delete(orderItemUnits).where(eq(orderItemUnits.id, row.id));
  return { ok: true, orderNumber: row.orderNumber, externalUnitId: row.externalUnitId };
}

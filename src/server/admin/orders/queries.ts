import "server-only";
import { and, asc, count, desc, eq, gte, ilike, inArray, isNotNull, isNull, lt, or, sql, type SQL } from "drizzle-orm";
import { tallinnLocalToUtc } from "@/domain/time/tallinn";
import { requireAdmin } from "@/server/auth/auth";
import { getDb } from "@/server/db/client";
import { orderInternalNotes, orderItems, orderStatusHistory, orders, supplierInventoryUnits } from "@/server/db/schema";
import { loadCandidateUnits, loadOrderItemUnits } from "@/server/orders/order-units";
import { loadProcurements } from "@/server/orders/procurement";
import { ADMIN_PAGE_SIZE } from "../products/queries";

export interface OrderListFilters {
  q?: string;
  status?: string;
  payment?: string;
  kind?: "test" | "real";
  /** YYYY-MM-DD (Eesti aeg) */
  from?: string;
  to?: string;
  coupon?: "yes" | "no";
  sort?: "newest" | "oldest" | "total-desc" | "total-asc";
  page: number;
}

/** "2026-10-11" Eesti aja päeva algus UTC-s */
function dayStart(date: string | undefined, addDays = 0): Date | null {
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  const [y, m, d] = date.split("-").map(Number);
  const shifted = new Date(Date.UTC(y, m - 1, d + addDays));
  const result = tallinnLocalToUtc(`${shifted.toISOString().slice(0, 10)}T00:00`);
  return result instanceof Date ? result : null;
}

export async function listOrders(filters: OrderListFilters) {
  await requireAdmin();
  const db = getDb();
  const conditions: SQL[] = [];
  if (filters.q) {
    const like = `%${filters.q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
    conditions.push(
      or(ilike(orders.orderNumber, like), ilike(orders.customerEmail, like), sql`(${orders.customerFirstName} || ' ' || ${orders.customerLastName}) ILIKE ${like}`, ilike(orders.companyName, like))!,
    );
  }
  if (filters.status) conditions.push(eq(orders.status, filters.status as "CREATED"));
  if (filters.payment) conditions.push(eq(orders.paymentStatus, filters.payment as "NOT_STARTED"));
  if (filters.kind) conditions.push(eq(orders.isTest, filters.kind === "test"));
  const from = dayStart(filters.from);
  const to = dayStart(filters.to, 1);
  if (from) conditions.push(gte(orders.createdAt, from));
  if (to) conditions.push(lt(orders.createdAt, to));
  if (filters.coupon === "yes") conditions.push(isNotNull(orders.discountCode));
  if (filters.coupon === "no") conditions.push(isNull(orders.discountCode));
  const where = conditions.length ? and(...conditions) : undefined;

  const order = {
    newest: [desc(orders.createdAt)],
    oldest: [asc(orders.createdAt)],
    "total-desc": [desc(orders.totalCents), desc(orders.createdAt)],
    "total-asc": [asc(orders.totalCents), desc(orders.createdAt)],
  }[filters.sort ?? "newest"];
  // NB! Välise tabeli veerg kirjutatakse täielikult kvalifitseerituna: ilma join'ita jätab Drizzle tabeli nime
  // ära ("id") ja Postgres seoks selle alampäringu tabeli (order_items.id) külge → vale tulemus (0).
  const itemCount = sql<number>`(SELECT coalesce(sum(oi.quantity), 0)::int FROM ${orderItems} oi WHERE oi.order_id = "orders"."id")`;

  const [rows, [{ total }]] = await Promise.all([
    db
      .select({
        id: orders.id,
        orderNumber: orders.orderNumber,
        createdAt: orders.createdAt,
        customerName: sql<string>`${orders.customerFirstName} || ' ' || ${orders.customerLastName}`,
        customerEmail: orders.customerEmail,
        companyName: orders.companyName,
        itemCount,
        subtotalCents: orders.subtotalCents,
        discountAmountCents: orders.discountAmountCents,
        discountCode: orders.discountCode,
        totalCents: orders.totalCents,
        status: orders.status,
        paymentStatus: orders.paymentStatus,
        isTest: orders.isTest,
      })
      .from(orders)
      .where(where)
      .orderBy(...order)
      .limit(ADMIN_PAGE_SIZE)
      .offset((filters.page - 1) * ADMIN_PAGE_SIZE),
    db.select({ total: count() }).from(orders).where(where),
  ]);
  return { rows, total, pageCount: Math.max(1, Math.ceil(total / ADMIN_PAGE_SIZE)) };
}

export async function getOrderDetail(id: string) {
  await requireAdmin();
  const db = getDb();
  const [order] = await db.select().from(orders).where(eq(orders.id, id)).limit(1);
  if (!order) return null;
  const [items, history, notes] = await Promise.all([
    db.select().from(orderItems).where(eq(orderItems.orderId, id)).orderBy(asc(orderItems.position)),
    db.select().from(orderStatusHistory).where(eq(orderStatusHistory.orderId, id)).orderBy(asc(orderStatusHistory.createdAt), asc(orderStatusHistory.id)),
    db.select().from(orderInternalNotes).where(eq(orderInternalNotes.orderId, id)).orderBy(desc(orderInternalNotes.createdAt), desc(orderInternalNotes.id)),
  ]);
  // Tarnija füüsilised seadmed (nt Tech seerianumbrid) — ainult admin
  const listingIds = [...new Set(items.map((i) => i.supplierListingId).filter((id): id is string => id !== null))];
  const [unitsByItem, candidatesByListing, procurementByItem] = await Promise.all([
    loadOrderItemUnits(db, items.map((i) => i.id)),
    loadCandidateUnits(db, listingIds),
    loadProcurements(db, items.map((i) => i.id)),
  ]);
  const listingsWithUnits = listingIds.length
    ? new Set((await db.selectDistinct({ id: supplierInventoryUnits.supplierListingId }).from(supplierInventoryUnits).where(inArray(supplierInventoryUnits.supplierListingId, listingIds))).map((r) => r.id))
    : new Set<string | null>();
  const units = items
    .filter((item) => (item.supplierListingId && listingsWithUnits.has(item.supplierListingId)) || unitsByItem.has(item.id))
    .map((item) => ({ itemId: item.id, title: item.title, quantity: item.quantity, assigned: unitsByItem.get(item.id) ?? [], candidates: item.supplierListingId ? (candidatesByListing.get(item.supplierListingId) ?? []) : [] }));
  // Tarnijalt käsitsi tellimine (Foxway): rea snapshot + hanke seis
  const procurements = items.flatMap((item) => {
    const procurement = procurementByItem.get(item.id);
    return procurement ? [{ item: { id: item.id, title: item.title, model: item.model, sku: item.sku, quantity: item.quantity, unitPriceCents: item.unitPriceCents }, procurement }] : [];
  });
  return { order, items, history, notes, units, procurements };
}

/** Töölaud: testtellimused eraldi (need ei ole müük). Käivet ega konversiooni ei arvutata. */
export async function getOrderCounts() {
  await requireAdmin();
  const db = getDb();
  const today = dayStart(new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Tallinn" }).format(new Date()));
  const [[testToday], [testTotal], [realTotal]] = await Promise.all([
    db.select({ n: count() }).from(orders).where(and(eq(orders.isTest, true), today ? gte(orders.createdAt, today) : undefined)),
    db.select({ n: count() }).from(orders).where(eq(orders.isTest, true)),
    db.select({ n: count() }).from(orders).where(eq(orders.isTest, false)),
  ]);
  return { testToday: testToday.n, testTotal: testTotal.n, realTotal: realTotal.n };
}

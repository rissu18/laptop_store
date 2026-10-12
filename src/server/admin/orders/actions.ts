"use server";

import { and, eq } from "drizzle-orm";
import { refresh } from "next/cache";
import { z } from "zod";
import { canTransition, type OrderStatus } from "@/domain/orders/order-status";
import { getDb } from "@/server/db/client";
import { discountRedemptions, orderInternalNotes, orderItemProcurements, orderItems, orderStatusHistory, orders } from "@/server/db/schema";
import { procurementDates, procurementUpdateSchema } from "@/domain/orders/procurement";
import { cancelRedemption } from "@/server/discounts/redemptions";
import { assignUnitToOrderItem, unassignUnitFromOrderItem } from "@/server/orders/order-units";
import { getOrderNotificationService } from "@/server/orders/notifications";
import { fail, ok, type ActionResult } from "../action-result";
import { writeAudit } from "../audit";
import { runAdminAction } from "../run-action";

/**
 * Admini tellimuse toimingud. Selles faasis on lubatud AINULT tühistamine ja sisemärkmed —
 * makseta ei saa admin tellimust "makstuks" märkida (PAID tuleb ainult makseteenuselt).
 */

const uuid = z.uuid();

export async function cancelOrderAction(id: string, reason: string): Promise<ActionResult> {
  return runAdminAction("order.cancel", async (admin) => {
    if (!uuid.safeParse(id).success) return fail("Vigane tellimuse ID");
    const note = String(reason ?? "").trim().slice(0, 500) || null;
    const result = await getDb().transaction(async (tx) => {
      const [order] = await tx.select().from(orders).where(eq(orders.id, id)).for("update");
      if (!order) return fail("Tellimust ei leitud");
      if (!canTransition(order.status as OrderStatus, "CANCELLED", "ADMIN")) return fail(`Tellimust olekus ${order.status} ei saa tühistada.`);
      const now = new Date();
      await tx.update(orders).set({ status: "CANCELLED", cancelledAt: now }).where(eq(orders.id, id));
      await tx.insert(orderStatusHistory).values({ orderId: id, kind: "ORDER", fromStatus: order.status, toStatus: "CANCELLED", source: "ADMIN", adminUserId: admin.id, adminEmail: admin.email, note });
      // Sooduskoodi reserveering vabastatakse (testtellimusel seda pole — kasutust ei loodud)
      const pending = await tx.select().from(discountRedemptions).where(and(eq(discountRedemptions.orderId, id), eq(discountRedemptions.status, "PENDING")));
      for (const redemption of pending) await cancelRedemption(tx, redemption.id);
      // Testtellimus laoseisu ei vähendanud → taastada pole vaja. Päris tellimus: laoseisu/tarnija tühistus tarnija faasis.
      await writeAudit(tx, admin, {
        action: "order.cancel",
        entityType: "Order",
        entityId: id,
        entityLabel: order.orderNumber,
        changes: { status: { from: order.status, to: "CANCELLED" }, ...(pending.length ? { releasedDiscountReservations: { from: 0, to: pending.length } } : {}) },
      });
      return { ...ok(`Tellimus ${order.orderNumber} tühistatud.`), order };
    });
    if (result.ok && "order" in result) {
      refresh(); // admini leht näitab kohe uut olekut ja ajalugu
      await getOrderNotificationService().send("CANCELLATION", { orderNumber: result.order.orderNumber, isTest: result.order.isTest, customerEmail: result.order.customerEmail });
      return ok(result.message);
    }
    return result;
  });
}

const noteSchema = z.string().trim().min(1, "Märkus on tühi").max(2000, "Kuni 2000 märki");

/** Sisemärkus (kliendile ei näidata). Ainult lisamine — muutmist ega kustutamist pole, ajalugu säilib. */
export async function addOrderNoteAction(id: string, _prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  return runAdminAction("order.note", async (admin) => {
    if (!uuid.safeParse(id).success) return fail("Vigane tellimuse ID");
    const parsed = noteSchema.safeParse(formData.get("note"));
    if (!parsed.success) return fail(parsed.error.issues[0].message, { note: parsed.error.issues[0].message });
    const result = await getDb().transaction(async (tx) => {
      const [order] = await tx.select({ id: orders.id, orderNumber: orders.orderNumber }).from(orders).where(eq(orders.id, id));
      if (!order) return fail("Tellimust ei leitud");
      await tx.insert(orderInternalNotes).values({ orderId: id, adminUserId: admin.id, adminEmail: admin.email, note: parsed.data });
      // Auditisse ei kopeerita märkuse teksti (võib sisaldada isikuandmeid) — ainult fakt ja pikkus
      await writeAudit(tx, admin, { action: "order.note_added", entityType: "Order", entityId: id, entityLabel: order.orderNumber, changes: { noteLength: { from: null, to: parsed.data.length } } });
      return ok("Märkus lisatud.");
    });
    if (result.ok) refresh();
    return result;
  });
}

/**
 * Tellimuse reale füüsilise seadme (Tech ID + seerianumber) määramine — ainult admin, kliendile ei näidata.
 * Ainult märge: seadet ei reserveerita, ei märgita müüduks ega saadeta tarnijale (vt docs/TECH_SYNC.md).
 */
export async function assignOrderUnitAction(orderId: string, orderItemId: string, inventoryUnitId: string): Promise<ActionResult> {
  return runAdminAction("order.unit_assign", async (admin) => {
    if (![orderId, orderItemId, inventoryUnitId].every((id) => uuid.safeParse(id).success)) return fail("Vigane ID");
    const result = await getDb().transaction(async (tx) => {
      const assigned = await assignUnitToOrderItem(tx, { orderId, orderItemId, inventoryUnitId, admin: { id: admin.id, email: admin.email } });
      if (!assigned.ok) return assigned;
      // Auditisse ainult Tech ID (mitte seerianumber)
      await writeAudit(tx, admin, { action: "order.unit_assigned", entityType: "Order", entityId: orderId, entityLabel: assigned.orderNumber, changes: { unit: { from: null, to: assigned.externalUnitId } } });
      return assigned;
    });
    if (!result.ok) return fail(result.error);
    refresh();
    return ok(`Seade ${result.externalUnitId} määratud.`);
  });
}

export async function unassignOrderUnitAction(orderId: string, assignmentId: string): Promise<ActionResult> {
  return runAdminAction("order.unit_unassign", async (admin) => {
    if (![orderId, assignmentId].every((id) => uuid.safeParse(id).success)) return fail("Vigane ID");
    const result = await getDb().transaction(async (tx) => {
      const removed = await unassignUnitFromOrderItem(tx, { orderId, assignmentId });
      if (!removed.ok) return removed;
      await writeAudit(tx, admin, { action: "order.unit_unassigned", entityType: "Order", entityId: orderId, entityLabel: removed.orderNumber, changes: { unit: { from: removed.externalUnitId, to: null } } });
      return removed;
    });
    if (!result.ok) return fail(result.error);
    refresh();
    return ok(`Seade ${result.externalUnitId} eemaldatud.`);
  });
}

/**
 * Tarnijalt käsitsi tellimise (hange) seis tellimuse real — nt Foxway: "Tellida Foxwayst" → "Foxwayst tellitud" →
 * "Tarnija saatnud" → "Meieni jõudnud". Ainult märge adminis: Foxway API-sse midagi ei saadeta (automaatset tellimust
 * ega dropshippingut pole). Tegelik ostuhind võib erineda hinnakirja hinnast (erihind) — mõlemad säilivad.
 */
export async function updateProcurementAction(orderId: string, procurementId: string, _prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  return runAdminAction("order.procurement", async (admin) => {
    if (!uuid.safeParse(orderId).success || !uuid.safeParse(procurementId).success) return fail("Vigane ID");
    const parsed = procurementUpdateSchema.safeParse(Object.fromEntries(["status", "supplierOrderReference", "note", "supplierSerial", "actualPurchasePriceCents"].map((k) => [k, formData.get(k) ?? ""])));
    if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Kontrolli välju");
    const input = parsed.data;
    const result = await getDb().transaction(async (tx) => {
      const [row] = await tx
        .select({ procurement: orderItemProcurements, orderNumber: orders.orderNumber })
        .from(orderItemProcurements)
        .innerJoin(orderItems, eq(orderItems.id, orderItemProcurements.orderItemId))
        .innerJoin(orders, eq(orders.id, orderItems.orderId))
        .where(and(eq(orderItemProcurements.id, procurementId), eq(orders.id, orderId)))
        .for("update");
      if (!row) return fail("Hankekirjet ei leitud");
      const current = row.procurement;
      const next = { ...input, ...procurementDates(input.status, current, new Date()), updatedBy: admin.email };
      const changes: Record<string, { from: unknown; to: unknown }> = {};
      for (const key of ["status", "supplierOrderReference", "note", "supplierSerial", "actualPurchasePriceCents"] as const) {
        if ((current[key] ?? null) !== (next[key] ?? null)) changes[key] = { from: current[key] ?? null, to: next[key] ?? null };
      }
      if (!Object.keys(changes).length) return ok("Muudatusi polnud.");
      await tx.update(orderItemProcurements).set(next).where(eq(orderItemProcurements.id, procurementId));
      await writeAudit(tx, admin, { action: "order.procurement", entityType: "Order", entityId: orderId, entityLabel: `${row.orderNumber} · ${current.supplier} ${current.supplierSku}`, changes });
      return ok("Hanke seis salvestatud.");
    });
    if (result.ok) refresh();
    return result;
  });
}

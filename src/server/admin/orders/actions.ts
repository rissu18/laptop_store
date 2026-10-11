"use server";

import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { canTransition, type OrderStatus } from "@/domain/orders/order-status";
import { getDb } from "@/server/db/client";
import { discountRedemptions, orderInternalNotes, orderStatusHistory, orders } from "@/server/db/schema";
import { cancelRedemption } from "@/server/discounts/redemptions";
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
    return getDb().transaction(async (tx) => {
      const [order] = await tx.select({ id: orders.id, orderNumber: orders.orderNumber }).from(orders).where(eq(orders.id, id));
      if (!order) return fail("Tellimust ei leitud");
      await tx.insert(orderInternalNotes).values({ orderId: id, adminUserId: admin.id, adminEmail: admin.email, note: parsed.data });
      // Auditisse ei kopeerita märkuse teksti (võib sisaldada isikuandmeid) — ainult fakt ja pikkus
      await writeAudit(tx, admin, { action: "order.note_added", entityType: "Order", entityId: id, entityLabel: order.orderNumber, changes: { noteLength: { from: null, to: parsed.data.length } } });
      return ok("Märkus lisatud.");
    });
  });
}

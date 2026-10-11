"use server";

import { cookies } from "next/headers";
import { z } from "zod";
import { parseCheckoutForm } from "@/domain/checkout/checkout-form";
import { CHECKOUT_BLOCKED_MESSAGE } from "@/domain/checkout/checkout-mode";
import { UnauthorizedError, assertSameOrigin, getClientMeta } from "@/server/auth/auth";
import { getDb, isDatabaseConfigured } from "@/server/db/client";
import { errorMessage, newErrorId, writeSystemLog } from "@/server/logging/system-log";
import { ORDER_ACCESS_COOKIE_PREFIX } from "@/server/orders/constants";
import { placeOrder } from "@/server/orders/order-service";
import { lookupOrder, type LookupResult } from "@/server/orders/public-order";
import { computeCheckout, type CheckoutQuote, type PriceChange } from "./checkout-service";

/**
 * Kassa server action'id. Brauser saadab ainult: pakkumise ID, kogus, sooduskoodi tekst, kontaktandmed
 * ja (võrdluseks) hinnad, mida klient nägi. Summasid ja hindu brauserist ei võeta.
 */

const itemsSchema = z.array(z.object({ variantId: z.string().min(1).max(100), quantity: z.number().int().min(1).max(10) })).min(1).max(20);
const couponSchema = z.string().trim().max(40).nullable();

export async function getCheckoutQuoteAction(items: unknown, couponCode: unknown): Promise<CheckoutQuote | null> {
  if (!isDatabaseConfigured()) return null;
  const parsedItems = itemsSchema.safeParse(items);
  if (!parsedItems.success) return null;
  const coupon = couponSchema.safeParse(typeof couponCode === "string" ? couponCode : null);
  try {
    return (await computeCheckout(getDb(), { items: parsedItems.data, couponCode: coupon.success ? coupon.data : null })).quote;
  } catch (error) {
    await writeSystemLog({ level: "ERROR", source: "APPLICATION", message: "Kassa kokkuvõtte arvutamine ebaõnnestus", details: { reason: errorMessage(error) }, errorId: newErrorId() });
    return null;
  }
}

const placeOrderSchema = z.object({
  checkoutAttemptId: z.uuid(),
  items: itemsSchema,
  couponCode: couponSchema,
  form: z.record(z.string(), z.unknown()),
  acknowledged: z.object({
    lines: z.array(z.object({ variantId: z.string().max(100), unitPriceCents: z.number().int().min(0) })).max(20),
    totalCents: z.number().int().min(0),
    discountCents: z.number().int().min(0),
  }),
});

export type PlaceOrderActionResult =
  | { ok: true; orderNumber: string; existing: boolean }
  | { ok: false; kind: "VALIDATION"; fieldErrors: Record<string, string>; message: string }
  | { ok: false; kind: "REVIEW"; quote: CheckoutQuote; priceChanges: PriceChange[]; messages: string[] }
  | { ok: false; kind: "BLOCKED" | "EMPTY" | "ERROR"; message: string; errorId?: string };

export async function placeOrderAction(payload: unknown): Promise<PlaceOrderActionResult> {
  try {
    // CSRF: tellimust saab esitada ainult samalt saidilt
    await assertSameOrigin();
  } catch (error) {
    if (error instanceof UnauthorizedError) return { ok: false, kind: "ERROR", message: "Päring lükati tagasi. Värskenda lehte ja proovi uuesti." };
    throw error;
  }
  if (!isDatabaseConfigured()) return { ok: false, kind: "BLOCKED", message: CHECKOUT_BLOCKED_MESSAGE };

  const parsed = placeOrderSchema.safeParse(payload);
  if (!parsed.success) return { ok: false, kind: "ERROR", message: "Vigane päring. Värskenda lehte ja proovi uuesti." };
  const form = parseCheckoutForm(parsed.data.form);
  if (!form.success) return { ok: false, kind: "VALIDATION", fieldErrors: form.fieldErrors, message: "Kontrolli märgitud välju." };

  try {
    const result = await placeOrder(getDb(), {
      idempotencyKey: parsed.data.checkoutAttemptId,
      items: parsed.data.items,
      couponCode: parsed.data.couponCode,
      form: form.data,
      acknowledged: parsed.data.acknowledged,
    });
    switch (result.status) {
      case "CREATED":
      case "EXISTING":
        // Kinnituslehe juurdepääs: juhuslik token ainult httpOnly küpsises (andmebaasis räsi)
        (await cookies()).set(`${ORDER_ACCESS_COOKIE_PREFIX}${result.orderNumber}`, result.accessToken, {
          httpOnly: true,
          secure: process.env.NODE_ENV === "production",
          sameSite: "lax",
          path: "/tellimus",
          maxAge: 30 * 24 * 60 * 60,
        });
        return { ok: true, orderNumber: result.orderNumber, existing: result.status === "EXISTING" };
      case "REVIEW":
        return { ok: false, kind: "REVIEW", quote: result.quote, priceChanges: result.priceChanges, messages: result.messages };
      case "BLOCKED":
        return { ok: false, kind: "BLOCKED", message: result.message };
      case "EMPTY":
        return { ok: false, kind: "EMPTY", message: "Ostukorv on tühi." };
    }
  } catch (error) {
    const errorId = newErrorId();
    await writeSystemLog({ level: "ERROR", source: "APPLICATION", message: "Tellimuse loomine ebaõnnestus", details: { reason: errorMessage(error) }, errorId });
    return { ok: false, kind: "ERROR", message: "Tellimuse loomisel tekkis viga. Proovi uuesti.", errorId };
  }
}

/** values = sisestatud väärtused, et vorm ei tühjeneks pärast ebaõnnestunud otsingut */
export type LookupState = (LookupResult & { submitted: true; values: { orderNumber: string; email: string } }) | { submitted: false };

export async function lookupOrderAction(_prev: LookupState, formData: FormData): Promise<LookupState> {
  const values = { orderNumber: String(formData.get("orderNumber") ?? "").slice(0, 40), email: String(formData.get("email") ?? "").slice(0, 200) };
  if (!isDatabaseConfigured()) return { submitted: true, values, ok: false, message: "Tellimuse otsing ei ole hetkel saadaval." };
  try {
    const { ip } = await getClientMeta();
    const result = await lookupOrder(getDb(), { ...values, ip });
    return { submitted: true, values, ...result };
  } catch (error) {
    const errorId = newErrorId();
    await writeSystemLog({ level: "ERROR", source: "APPLICATION", message: "Tellimuse otsing ebaõnnestus", details: { reason: errorMessage(error) }, errorId });
    return { submitted: true, values, ok: false, message: `Otsing ebaõnnestus tehnilise vea tõttu (veakood ${errorId}).` };
  }
}

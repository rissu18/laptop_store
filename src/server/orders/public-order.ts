import { and, asc, count, eq, gte, lt, sql } from "drizzle-orm";
import { normalizeOrderNumber } from "@/domain/orders/order-number";
import type { Database } from "@/server/db/client";
import { orderItems, orderLookupAttempts, orders } from "@/server/db/schema";
import { accessTokenMatches } from "./order-service";

/**
 * Kliendile näidatav tellimus. EI SISALDA: andmebaasi ID-sid, admini märkmeid, ostuhindu, marginaali,
 * auditit, sisemisi vigu ega juurdepääsu/idempotentsuse räsisid.
 */
export interface PublicOrderView {
  orderNumber: string;
  isTest: boolean;
  createdAt: string;
  status: string;
  paymentStatus: string;
  items: {
    sku: string;
    title: string;
    cpu: string | null;
    ramGb: number | null;
    storageGb: number | null;
    screen: string | null;
    keyboard: string | null;
    grade: string | null;
    quantity: number;
    unitPriceCents: number;
    discountCents: number;
    lineTotalCents: number;
    imagePath: string | null;
  }[];
  subtotalCents: number;
  discountCents: number;
  discountCode: string | null;
  shippingMethodName: string;
  shippingCents: number;
  totalCents: number;
  /** Ainult kinnituslehel (juurdepääsutokeniga) — otsingus ei näidata */
  contact?: { name: string; email: string; phone: string; company: string | null; registryCode: string | null; vatNumber: string | null };
  shippingAddress?: { line1: string; line2: string | null; city: string; postalCode: string; country: string };
}

type OrderRow = typeof orders.$inferSelect;

async function toView(db: Pick<Database, "select">, order: OrderRow, withPersonalData: boolean): Promise<PublicOrderView> {
  const items = await db.select().from(orderItems).where(eq(orderItems.orderId, order.id)).orderBy(asc(orderItems.position));
  return {
    orderNumber: order.orderNumber,
    isTest: order.isTest,
    createdAt: order.createdAt.toISOString(),
    status: order.status,
    paymentStatus: order.paymentStatus,
    items: items.map((i) => ({
      sku: i.sku,
      title: i.title,
      cpu: i.cpu,
      ramGb: i.ramGb,
      storageGb: i.storageGb,
      screen: i.screen,
      keyboard: i.keyboard,
      grade: i.grade,
      quantity: i.quantity,
      unitPriceCents: i.unitPriceCents,
      discountCents: i.discountAmountCents,
      lineTotalCents: i.lineTotalCents,
      imagePath: i.imagePath,
    })),
    subtotalCents: order.subtotalCents,
    discountCents: order.discountAmountCents,
    discountCode: order.discountCode,
    shippingMethodName: order.shippingMethodName,
    shippingCents: order.shippingAmountCents,
    totalCents: order.totalCents,
    ...(withPersonalData
      ? {
          contact: {
            name: `${order.customerFirstName} ${order.customerLastName}`,
            email: order.customerEmail,
            phone: order.customerPhone,
            company: order.companyName,
            registryCode: order.companyRegistryCode,
            vatNumber: order.companyVatNumber,
          },
          shippingAddress: { line1: order.shippingAddressLine1, line2: order.shippingAddressLine2, city: order.shippingCity, postalCode: order.shippingPostalCode, country: order.shippingCountry },
        }
      : {}),
  };
}

/**
 * Kinnitusleht: tellimus avaneb ainult koos juurdepääsutokeniga (httpOnly küpsises, loodud tellimuse
 * esitamisel). Tellimuse numbri muutmine URL-is ei anna ligipääsu teiste tellimustele.
 */
export async function findOrderForConfirmation(db: Pick<Database, "select">, orderNumberInput: string, token: string | null | undefined): Promise<PublicOrderView | null> {
  const orderNumber = normalizeOrderNumber(orderNumberInput);
  if (!orderNumber || !token) return null;
  const [order] = await db.select().from(orders).where(eq(orders.orderNumber, orderNumber)).limit(1);
  if (!order || !accessTokenMatches(token, order.publicAccessTokenHash)) return null;
  return toView(db, order, true);
}

export const LOOKUP_WINDOW_MS = 15 * 60 * 1000;
export const MAX_FAILED_LOOKUPS = 10;
export const LOOKUP_NOT_FOUND = "Tellimust ei leitud või sisestatud andmed ei klapi.";
export const LOOKUP_RATE_LIMITED = "Liiga palju katseid. Proovi mõne minuti pärast uuesti.";

export type LookupResult = { ok: true; order: PublicOrderView } | { ok: false; message: string };

/**
 * Avalik tellimuse otsing: tellimuse number JA e-post peavad klappima. Vastus on alati sama üldine,
 * olgu tellimust pole või e-post vale — tellimuse olemasolu ei leki. Ebaõnnestunud katsed on piiratud IP kaupa.
 */
export async function lookupOrder(db: Database, input: { orderNumber: string; email: string; ip: string; now?: Date }): Promise<LookupResult> {
  const now = input.now ?? new Date();
  const [{ n: failures }] = await db
    .select({ n: count() })
    .from(orderLookupAttempts)
    .where(and(eq(orderLookupAttempts.ip, input.ip), eq(orderLookupAttempts.success, false), gte(orderLookupAttempts.createdAt, new Date(now.getTime() - LOOKUP_WINDOW_MS))));
  if (failures >= MAX_FAILED_LOOKUPS) return { ok: false, message: LOOKUP_RATE_LIMITED };

  const orderNumber = normalizeOrderNumber(input.orderNumber);
  const email = input.email.trim().toLowerCase();
  const [order] = orderNumber && email.length <= 200
    ? await db.select().from(orders).where(and(eq(orders.orderNumber, orderNumber), sql`lower(${orders.customerEmail}) = ${email}`)).limit(1)
    : [];

  await db.insert(orderLookupAttempts).values({ ip: input.ip, success: Boolean(order) });
  await db.delete(orderLookupAttempts).where(lt(orderLookupAttempts.createdAt, new Date(now.getTime() - 24 * 60 * 60 * 1000)));
  if (!order) return { ok: false, message: LOOKUP_NOT_FOUND };
  return { ok: true, order: await toView(db, order, false) };
}

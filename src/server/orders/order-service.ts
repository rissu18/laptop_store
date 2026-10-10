import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { eq } from "drizzle-orm";
import type { CheckoutForm } from "@/domain/checkout/checkout-form";
import { CHECKOUT_BLOCKED_MESSAGE } from "@/domain/checkout/checkout-mode";
import { BRAND_NAMES, type BrandCode } from "@/domain/catalog/types";
import { buildDiscountSnapshot } from "@/domain/discounts/discount-engine";
import { generateOrderNumber } from "@/domain/orders/order-number";
import { computeCheckout, detectPriceChanges, type CheckoutItemInput, type CheckoutQuote, type PriceChange } from "@/server/checkout/checkout-service";
import type { Database } from "@/server/db/client";
import { orderItems, orderStatusHistory, orders } from "@/server/db/schema";
import { reserveRedemption } from "@/server/discounts/redemptions";
import { getOrderNotificationService, type OrderNotificationService } from "./notifications";

/**
 * Tellimuse loomine kassast.
 *
 * - IDEMPOTENTNE: sama checkoutAttemptId (brauseri genereeritud juhuslik võti) → sama tellimus, mitte uus.
 *   Andmebaasis on SHA-256(võti) UNIQUE, nii et ka kaks samaaegset päringut ei loo kahte tellimust.
 * - Kõik summad arvutatakse serveris (computeCheckout). Kliendi nähtud hindu kasutatakse ainult
 *   võrdluseks: kui midagi muutus, tellimust ei looda ja klient peab uue summa kinnitama.
 * - Üks andmebaasi tehing: tellimus + read (snapshot) + sooduskoodi snapshot + oleku ajalugu.
 * - Testtellimus: makset pole, tarnijale ei saadeta, laoseisu ei vähendata, sooduskoodi kasutust ei kulu.
 */

type Tx = Parameters<Parameters<Database["transaction"]>[0]>[0];

export const sha256 = (value: string) => createHash("sha256").update(value).digest("hex");
export const newAccessToken = () => randomBytes(32).toString("base64url");

export function accessTokenMatches(token: string | null | undefined, storedHash: string): boolean {
  if (!token || token.length > 100) return false;
  const a = Buffer.from(sha256(token), "hex");
  const b = Buffer.from(storedHash, "hex");
  return a.length === b.length && timingSafeEqual(a, b);
}

export interface PlaceOrderInput {
  /** Brauseri genereeritud juhuslik võti (UUID), sama iga korduskatse puhul */
  idempotencyKey: string;
  items: CheckoutItemInput[];
  couponCode: string | null;
  form: CheckoutForm;
  /** Mida klient nägi ja kinnitas (ainult võrdluseks) */
  acknowledged: { lines: { variantId: string; unitPriceCents: number }[]; totalCents: number; discountCents: number };
}

export type PlaceOrderResult =
  | { status: "CREATED" | "EXISTING"; orderNumber: string; accessToken: string; isTest: boolean }
  | { status: "REVIEW"; quote: CheckoutQuote; priceChanges: PriceChange[]; messages: string[] }
  | { status: "BLOCKED"; message: string }
  | { status: "EMPTY" };

export interface OrderRecord {
  order: typeof orders.$inferInsert;
  items: Omit<typeof orderItems.$inferInsert, "orderId">[];
}

/** Kirjutab tellimuse, read ja algse ajaloo ÜHES tehingus (tx). Viga → kõik tühistatakse. */
export async function insertOrderRecords(tx: Tx, record: OrderRecord) {
  const [order] = await tx.insert(orders).values(record.order).returning();
  await tx.insert(orderItems).values(record.items.map((item) => ({ ...item, orderId: order.id })));
  await tx.insert(orderStatusHistory).values([
    { orderId: order.id, kind: "ORDER", fromStatus: null, toStatus: "CREATED", source: "CHECKOUT", note: order.isTest ? "Testtellimus (prototüüp)" : null },
    { orderId: order.id, kind: "PAYMENT", fromStatus: null, toStatus: "NOT_STARTED", source: "CHECKOUT", note: order.isTest ? "Testtellimus — makset ei võeta" : null },
  ]);
  return order;
}

function isUniqueViolation(error: unknown, constraint: string): boolean {
  const e = error as { code?: string; constraint?: string; cause?: { code?: string; constraint?: string } };
  const code = e?.code ?? e?.cause?.code;
  const name = e?.constraint ?? e?.cause?.constraint;
  return code === "23505" && name === constraint;
}

/** Olemasolev tellimus sama võtmega: uus juurdepääsutoken (vana võis kaotsi minna, nt katkenud vastus). */
async function returnExisting(db: Database, keyHash: string): Promise<PlaceOrderResult | null> {
  const [existing] = await db.select({ id: orders.id, orderNumber: orders.orderNumber, isTest: orders.isTest }).from(orders).where(eq(orders.idempotencyKeyHash, keyHash));
  if (!existing) return null;
  const accessToken = newAccessToken();
  await db.update(orders).set({ publicAccessTokenHash: sha256(accessToken) }).where(eq(orders.id, existing.id));
  return { status: "EXISTING", orderNumber: existing.orderNumber, accessToken, isTest: existing.isTest };
}

export async function placeOrder(db: Database, input: PlaceOrderInput, deps: { now?: Date; notifier?: OrderNotificationService } = {}): Promise<PlaceOrderResult> {
  const keyHash = sha256(input.idempotencyKey);

  // 1. Korduv esitus (topeltklikk, brauseri retry) → sama tellimus
  const existing = await returnExisting(db, keyHash);
  if (existing) return existing;

  // 2. Kõik uuesti serveris
  const computation = await computeCheckout(db, { items: input.items, couponCode: input.couponCode, now: deps.now });
  const { quote } = computation;
  // Päris tellimusi selles faasis ei võeta (makseteenust pole) — ka siis, kui prototüübirežiim lülitatakse välja
  if (quote.mode !== "TEST") return { status: "BLOCKED", message: CHECKOUT_BLOCKED_MESSAGE };
  if (quote.lines.length === 0 && quote.issues.length === 0) return { status: "EMPTY" };

  // 3. Kas klient nägi täpselt seda, mida me nüüd tellimusse paneksime?
  const priceChanges = detectPriceChanges(quote, input.acknowledged.lines);
  const messages: string[] = [];
  for (const issue of quote.issues) messages.push(issue.kind === "INSUFFICIENT_STOCK" ? `${issue.title}: ${issue.message} (saadaval ${issue.available})` : issue.message);
  if (priceChanges.length) messages.push(priceChanges.length === 1 ? "Ühe toote hind on pärast ostukorvi lisamist muutunud." : "Mõne toote hind on pärast ostukorvi lisamist muutunud.");
  if (quote.discountError) messages.push(`Sooduskood: ${quote.discountError}`);
  if (!priceChanges.length && !quote.issues.length && !quote.discountError) {
    if ((quote.discount?.amountCents ?? 0) !== input.acknowledged.discountCents) messages.push("Soodustuse summa on muutunud.");
    else if (quote.totalCents !== input.acknowledged.totalCents) messages.push("Tellimuse summa on muutunud.");
  }
  if (messages.length) return { status: "REVIEW", quote, priceChanges, messages };

  // 4. Tellimus ühe tehinguna
  const isTest = quote.mode === "TEST";
  const accessToken = newAccessToken();
  const { form } = input;
  const evaluation = computation.evaluation?.valid ? computation.evaluation : null;
  const record = (orderNumber: string): OrderRecord => ({
    order: {
      orderNumber,
      isTest,
      status: "CREATED",
      paymentStatus: "NOT_STARTED",
      customerEmail: form.email,
      customerFirstName: form.firstName,
      customerLastName: form.lastName,
      customerPhone: form.phone,
      companyName: form.companyName,
      companyRegistryCode: form.companyRegistryCode,
      companyVatNumber: form.companyVatNumber,
      shippingMethodCode: quote.shipping.code,
      shippingMethodName: quote.shipping.name,
      shippingAddressLine1: form.addressLine1,
      shippingAddressLine2: form.addressLine2,
      shippingCity: form.city,
      shippingPostalCode: form.postalCode,
      shippingCountry: form.country,
      subtotalCents: quote.subtotalCents,
      discountAmountCents: quote.discount?.amountCents ?? 0,
      shippingAmountCents: quote.shipping.amountCents,
      totalCents: quote.totalCents,
      currency: quote.currency,
      discountCodeId: evaluation ? computation.discountRuleId : null,
      discountCode: evaluation ? computation.discountRule!.code : null,
      discountType: evaluation ? computation.discountRule!.type : null,
      discountValue: evaluation ? computation.discountRule!.value : null,
      discountSnapshot: evaluation ? buildDiscountSnapshot(computation.discountRule!, evaluation) : null,
      customerNote: form.customerNote,
      idempotencyKeyHash: keyHash,
      publicAccessTokenHash: sha256(accessToken),
    },
    items: computation.items.map(({ item, listingId, productModelId, quantity, discountCents }, position) => {
      const unit = item.variant.price.saleCents;
      const display = item.variant.display;
      return {
        position,
        productModelId,
        supplierListingId: listingId,
        sku: item.variant.sku,
        manufacturer: BRAND_NAMES[item.product.brand as BrandCode] ?? item.product.brand,
        model: `${item.product.series} ${item.product.model}`,
        title: item.product.title,
        cpu: item.variant.cpu.model,
        cpuGeneration: item.variant.cpu.generationKey,
        ramGb: item.variant.ramGb,
        storageGb: item.variant.storageGb,
        gpu: item.variant.gpu.model || null,
        screen: [`${String(item.product.screenSizeIn).replace(".", ",")}"`, display.resolution, display.panel].filter(Boolean).join(" "),
        keyboard: item.variant.keyboardLayout,
        grade: item.variant.grade,
        quantity,
        unitPriceCents: unit,
        lineSubtotalCents: unit * quantity,
        discountAmountCents: discountCents,
        lineTotalCents: unit * quantity - discountCents,
        imagePath: item.product.images[0]?.thumbnailUrl ?? null,
      };
    }),
  });

  for (let attempt = 0; attempt < 5; attempt++) {
    const orderNumber = generateOrderNumber(deps.now);
    try {
      const order = await db.transaction(async (tx) => {
        const created = await insertOrderRecords(tx, record(orderNumber));
        // Päris tellimus (makse faasis): sooduskoodi koht reserveeritakse samas tehingus.
        // TESTTELLIMUS EI KULUTA päris kampaania kasutuspiirangut — kasutust ei looda.
        if (!isTest && evaluation && computation.discountRuleId) {
          await reserveRedemption(tx, { discountCodeId: computation.discountRuleId, orderId: created.id, rule: computation.discountRule!, result: evaluation });
        }
        // Laoseisu testtellimus ei vähenda. Päris tellimus: laoseisu reserveerimine + tarnija tellimus (tarnija faasis).
        return created;
      });
      await (deps.notifier ?? getOrderNotificationService()).send("ORDER_CONFIRMATION", { orderNumber: order.orderNumber, isTest, customerEmail: order.customerEmail });
      return { status: "CREATED", orderNumber: order.orderNumber, accessToken, isTest };
    } catch (error) {
      if (isUniqueViolation(error, "orders_idempotency_uq")) {
        // Samaaegne korduspäring jõudis ette → tagasta see tellimus
        const again = await returnExisting(db, keyHash);
        if (again) return again;
      }
      if (isUniqueViolation(error, "orders_order_number_uq")) continue; // väga harv kokkupõrge → uus number
      throw error;
    }
  }
  throw new Error("Tellimuse numbri genereerimine ebaõnnestus");
}

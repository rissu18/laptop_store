/**
 * Tellimuse olekumasin. Selles faasis kasutatakse CREATED → CANCELLED; ülejäänud üleminekud on
 * kirjeldatud makse- ja tarnefaaside jaoks, et neid hiljem ei peaks välja mõtlema.
 */
export const ORDER_STATUS_VALUES = ["CREATED", "AWAITING_PAYMENT", "PAID", "PROCESSING", "SHIPPED", "COMPLETED", "CANCELLED", "REFUNDED"] as const;
export type OrderStatus = (typeof ORDER_STATUS_VALUES)[number];

export const PAYMENT_STATUS_VALUES = ["NOT_STARTED", "PENDING", "PAID", "FAILED", "REFUNDED"] as const;
export type PaymentStatus = (typeof PAYMENT_STATUS_VALUES)[number];

/** Lubatud üleminekud. PAID tuleb AINULT makseteenuse kinnitusest (mitte admini nupust). */
export const ORDER_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  CREATED: ["AWAITING_PAYMENT", "CANCELLED"],
  AWAITING_PAYMENT: ["PAID", "CANCELLED"],
  PAID: ["PROCESSING", "REFUNDED"],
  PROCESSING: ["SHIPPED", "CANCELLED"],
  SHIPPED: ["COMPLETED"],
  COMPLETED: ["REFUNDED"],
  CANCELLED: [],
  REFUNDED: [],
};

export type TransitionSource = "CHECKOUT" | "ADMIN" | "SYSTEM" | "PAYMENT";

/** Admin võib selles faasis ainult tühistada; makse olekuid admin käsitsi ei muuda. */
const ADMIN_ALLOWED_TARGETS: OrderStatus[] = ["CANCELLED"];

export function canTransition(from: OrderStatus, to: OrderStatus, source: TransitionSource): boolean {
  if (!ORDER_TRANSITIONS[from].includes(to)) return false;
  if (source === "ADMIN" && !ADMIN_ALLOWED_TARGETS.includes(to)) return false;
  if (to === "PAID" && source !== "PAYMENT") return false;
  return true;
}

export const ORDER_STATUS_LABELS: Record<OrderStatus, string> = {
  CREATED: "Loodud",
  AWAITING_PAYMENT: "Ootab makset",
  PAID: "Makstud",
  PROCESSING: "Töötlemisel",
  SHIPPED: "Saadetud",
  COMPLETED: "Täidetud",
  CANCELLED: "Tühistatud",
  REFUNDED: "Raha tagastatud",
};

export const PAYMENT_STATUS_LABELS: Record<PaymentStatus, string> = {
  NOT_STARTED: "Makset pole alustatud",
  PENDING: "Makse ootel",
  PAID: "Makstud",
  FAILED: "Makse ebaõnnestus",
  REFUNDED: "Tagastatud",
};

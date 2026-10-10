/**
 * Tellimuse teavitused (e-kirjad). Päris e-posti teenus lisandub hiljem sama liidese taha.
 * Praegu NoopOrderNotificationService: midagi ei saadeta ja kliendi andmeid ei logita
 * (logisse läheb ainult tellimuse number ja sündmuse tüüp).
 */
export type OrderNotificationEvent = "ORDER_CONFIRMATION" | "PAYMENT_CONFIRMATION" | "SHIPPING_CONFIRMATION" | "CANCELLATION";

export interface OrderNotificationService {
  send(event: OrderNotificationEvent, order: { orderNumber: string; isTest: boolean; customerEmail: string }): Promise<void>;
}

export class NoopOrderNotificationService implements OrderNotificationService {
  readonly sent: { event: OrderNotificationEvent; orderNumber: string }[] = [];
  async send(event: OrderNotificationEvent, order: { orderNumber: string }): Promise<void> {
    this.sent.push({ event, orderNumber: order.orderNumber });
  }
}

export function getOrderNotificationService(): OrderNotificationService {
  return new NoopOrderNotificationService();
}

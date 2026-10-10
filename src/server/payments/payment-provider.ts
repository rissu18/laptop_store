/**
 * Makseteenuse liides. Päris pakkuja (nt Montonio, Maksekeskus, Stripe) lisatakse eraldi makse faasis.
 *
 * SELLES FAASIS POLE ÜHTEGI MAKSETEENUST — ka mitte "fake" pakkujat. getConfiguredPaymentProvider()
 * tagastab null, mistõttu kassa töötab ainult prototüübirežiimis testtellimustega ja on muidu suletud
 * (vt src/domain/checkout/checkout-mode.ts).
 */
export interface PaymentProvider {
  readonly code: string;
  readonly name: string;
  /** Loob makse ja tagastab aadressi, kuhu klient suunata */
  createPayment(input: { orderNumber: string; amountCents: number; currency: string; returnUrl: string }): Promise<{ redirectUrl: string; providerPaymentId: string }>;
  /** Kontrollib makse staatuse pakkuja API-st (webhook'i keha üksi ei usaldata) */
  getPaymentStatus(providerPaymentId: string): Promise<"PENDING" | "PAID" | "FAILED">;
}

export function getConfiguredPaymentProvider(): PaymentProvider | null {
  return null;
}

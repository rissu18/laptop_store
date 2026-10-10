/**
 * Kassa režiim — kaitse selle vastu, et pood hakkaks kogemata päris tellimusi vastu võtma.
 *
 *   prototüübirežiim sees                   → TEST    (ainult testtellimused, makset pole)
 *   prototüüp väljas + makseteenus olemas   → LIVE    (päris tellimused — makse faasis)
 *   prototüüp väljas + makseteenust pole    → BLOCKED (kassa suletud, kasutajasõbralik teade)
 */
export type CheckoutMode = "TEST" | "LIVE" | "BLOCKED";

export function resolveCheckoutMode(input: { prototypeMode: boolean; paymentProviderConfigured: boolean }): CheckoutMode {
  if (input.prototypeMode) return "TEST";
  return input.paymentProviderConfigured ? "LIVE" : "BLOCKED";
}

export const CHECKOUT_BLOCKED_MESSAGE = "Tellimuste vastuvõtmine avaneb peagi. Makseviisi seadistamine on veel pooleli — palun proovi hiljem uuesti.";
export const TEST_ORDER_NOTICE = "See on prototüübi testtellimus. Makseid ei võeta vastu ja tellimust päriselt ei täideta.";

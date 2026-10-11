import { beforeEach, describe, expect, it, vi } from "vitest";
import { TERMS_REQUIRED_MESSAGE } from "@/domain/checkout/checkout-form";

/**
 * Serveripoolne kontroll: tellimust ei looda ilma E-poe tingimustega nõustumiseta, isegi kui brauseri
 * kontroll on mööda hiilitud (otse server action'i kutsudes).
 */

const mocks = vi.hoisted(() => ({ placeOrder: vi.fn(), cookieSet: vi.fn() }));

vi.mock("@/server/auth/auth", () => ({
  UnauthorizedError: class extends Error {},
  assertSameOrigin: async () => {},
  getClientMeta: async () => ({ ip: "10.0.0.1", userAgent: "vitest" }),
}));
vi.mock("@/server/db/client", () => ({ getDb: () => ({}), isDatabaseConfigured: () => true }));
vi.mock("@/server/orders/order-service", () => ({ placeOrder: mocks.placeOrder }));
vi.mock("@/server/orders/public-order", () => ({ lookupOrder: vi.fn() }));
vi.mock("@/server/logging/system-log", () => ({ writeSystemLog: async () => {}, newErrorId: () => "TESTID", errorMessage: (e: unknown) => String(e) }));
vi.mock("next/headers", () => ({ cookies: async () => ({ set: mocks.cookieSet }) }));
vi.mock("./checkout-service", () => ({ computeCheckout: vi.fn() }));

const form = {
  firstName: "Mari",
  lastName: "Maasikas",
  email: "mari@example.com",
  phone: "+372 5123 4567",
  addressLine1: "Pärnu mnt 1",
  addressLine2: "",
  city: "Tallinn",
  postalCode: "10115",
  country: "EE",
  isCompany: false,
  companyName: "",
  companyRegistryCode: "",
  companyVatNumber: "",
  customerNote: "",
};

const payload = (formValues: Record<string, unknown>) => ({
  checkoutAttemptId: "8f14e45f-ceea-4e7a-9f0b-2c3d4e5f6a7b",
  items: [{ variantId: "laptopid-6678", quantity: 1 }],
  couponCode: null,
  form: formValues,
  acknowledged: { lines: [{ variantId: "laptopid-6678", unitPriceCents: 74900 }], totalCents: 74900, discountCents: 0 },
});

describe("placeOrderAction — E-poe tingimustega nõustumine (server)", () => {
  beforeEach(() => {
    mocks.placeOrder.mockReset();
    mocks.placeOrder.mockResolvedValue({ status: "CREATED", orderNumber: "SL-26-TEST01", accessToken: "token" });
  });

  it("ilma nõustumiseta (puudub või false) → VALIDATION, tellimust ei looda", async () => {
    const { placeOrderAction } = await import("./checkout-actions");
    for (const values of [form, { ...form, acceptTerms: false }, { ...form, acceptTerms: "on" }]) {
      const result = await placeOrderAction(payload(values));
      expect(result).toMatchObject({ ok: false, kind: "VALIDATION", fieldErrors: { acceptTerms: TERMS_REQUIRED_MESSAGE } });
    }
    expect(mocks.placeOrder).not.toHaveBeenCalled();
  });

  it("nõustumisega → olemasolev tellimuse loomine (testtellimuse flow) käivitub muutmata andmetega", async () => {
    const { placeOrderAction } = await import("./checkout-actions");
    const result = await placeOrderAction(payload({ ...form, acceptTerms: true }));
    expect(result).toEqual({ ok: true, orderNumber: "SL-26-TEST01", existing: false });
    expect(mocks.placeOrder).toHaveBeenCalledTimes(1);
    const input = mocks.placeOrder.mock.calls[0][1];
    expect(input.form).toMatchObject({ firstName: "Mari", email: "mari@example.com" });
    expect("acceptTerms" in input.form).toBe(false);
    expect(mocks.cookieSet).toHaveBeenCalled();
  });
});

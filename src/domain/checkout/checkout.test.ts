import { describe, expect, it, vi } from "vitest";
import { handlePlaceOrderResult } from "@/client/checkout-flow";
import { generateOrderNumber, normalizeOrderNumber } from "@/domain/orders/order-number";
import { canTransition } from "@/domain/orders/order-status";
import { quoteShipping, availableShippingMethods } from "@/domain/shipping/shipping";
import { DEFAULT_SETTINGS } from "@/domain/settings/settings";
import { TERMS_REQUIRED_MESSAGE, parseCheckoutForm } from "./checkout-form";
import { resolveCheckoutMode } from "./checkout-mode";

const valid = {
  firstName: "Mari",
  lastName: "Maasikas",
  email: "Mari@Example.com ",
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
  acceptTerms: true,
};

describe("kassa vorm", () => {
  it("1. kehtiv külalisostu vorm; e-post normaliseeritakse, tühjad valikulised väljad = null", () => {
    const r = parseCheckoutForm(valid);
    expect(r.success).toBe(true);
    if (r.success) expect(r.data).toMatchObject({ email: "mari@example.com", addressLine2: null, customerNote: null, companyName: null, country: "EE" });
  });

  it("2. kohustuslikud väljad puudu", () => {
    const r = parseCheckoutForm({ ...valid, firstName: "", lastName: " ", addressLine1: "", city: "" });
    expect(r.success).toBe(false);
    if (!r.success) expect(Object.keys(r.fieldErrors).sort()).toEqual(["addressLine1", "city", "firstName", "lastName"]);
  });

  it("3. vigane e-post ja telefon", () => {
    const r = parseCheckoutForm({ ...valid, email: "mari@", phone: "abc" });
    expect(!r.success && Object.keys(r.fieldErrors).sort()).toEqual(["email", "phone"]);
  });

  it("4. Eesti postiindeks = 5 numbrit", () => {
    expect(parseCheckoutForm({ ...valid, postalCode: "1011" }).success).toBe(false);
    expect(parseCheckoutForm({ ...valid, postalCode: "10115a" }).success).toBe(false);
    const r = parseCheckoutForm({ ...valid, postalCode: "12345" });
    expect(r.success).toBe(true);
    expect(parseCheckoutForm({ ...valid, country: "XX" }).success).toBe(false);
  });

  it("5. ettevõtte väljad kohustuslikud ainult ettevõtte ostul; eraisiku ostul neid ei salvestata", () => {
    const missing = parseCheckoutForm({ ...valid, isCompany: true });
    expect(!missing.success && Object.keys(missing.fieldErrors).sort()).toEqual(["companyName", "companyRegistryCode"]);
    expect(parseCheckoutForm({ ...valid, isCompany: true, companyName: "Firma OÜ", companyRegistryCode: "123" }).success).toBe(false);
    const ok = parseCheckoutForm({ ...valid, isCompany: true, companyName: "Firma OÜ", companyRegistryCode: "12345678", companyVatNumber: "ee101234567" });
    expect(ok.success && ok.data).toMatchObject({ companyName: "Firma OÜ", companyVatNumber: "EE101234567" });
    const privatePurchase = parseCheckoutForm({ ...valid, companyName: "Peidetud OÜ", companyRegistryCode: "12345678" });
    expect(privatePurchase.success && privatePurchase.data.companyName).toBeNull();
  });

  it("E-poe tingimustega nõustumine on kohustuslik (puudub / false / tekst → arusaadav viga)", () => {
    const { acceptTerms: _omit, ...withoutTerms } = valid;
    void _omit;
    for (const input of [withoutTerms, { ...valid, acceptTerms: false }, { ...valid, acceptTerms: "on" }, { ...valid, acceptTerms: "true" }]) {
      const r = parseCheckoutForm(input);
      expect(r.success).toBe(false);
      if (!r.success) expect(r.fieldErrors.acceptTerms).toBe(TERMS_REQUIRED_MESSAGE);
    }
  });

  it("nõustumine ei lähe tellimuse andmetesse (tellimuse loomine ei muutu)", () => {
    const r = parseCheckoutForm(valid);
    expect(r.success && "acceptTerms" in r.data).toBe(false);
  });

  it("isikukoodi, sünniaega ega muid lisavälju ei võeta vastu", () => {
    const r = parseCheckoutForm({ ...valid, personalCode: "38001010000", birthDate: "1980-01-01" });
    expect(r.success && "personalCode" in r.data).toBe(false);
  });
});

describe("kassa režiim (fail-safe)", () => {
  it("6. prototüüp → ainult testtellimused; päris režiim ilma makseteenuseta → suletud", () => {
    expect(resolveCheckoutMode({ prototypeMode: true, paymentProviderConfigured: false })).toBe("TEST");
    expect(resolveCheckoutMode({ prototypeMode: true, paymentProviderConfigured: true })).toBe("TEST");
    expect(resolveCheckoutMode({ prototypeMode: false, paymentProviderConfigured: false })).toBe("BLOCKED");
    expect(resolveCheckoutMode({ prototypeMode: false, paymentProviderConfigured: true })).toBe("LIVE");
  });
});

describe("tellimuse number ja olekud", () => {
  it("number: SL-AA-XXXXXX, juhuslik, normaliseeritav", () => {
    const numbers = Array.from({ length: 500 }, () => generateOrderNumber(new Date("2026-10-11T00:00:00Z")));
    for (const n of numbers) expect(n).toMatch(/^SL-26-[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{6}$/);
    expect(new Set(numbers).size).toBe(500);
    expect(normalizeOrderNumber(" sl-26-a7k4p9 ")).toBe("SL-26-A7K4P9");
    expect(normalizeOrderNumber("1")).toBeNull();
    expect(normalizeOrderNumber("SL-26-A7K4P9' OR 1=1")).toBeNull();
  });

  it("olekumasin: admin saab ainult tühistada; PAID ainult makseteenuselt", () => {
    expect(canTransition("CREATED", "CANCELLED", "ADMIN")).toBe(true);
    expect(canTransition("CANCELLED", "CANCELLED", "ADMIN")).toBe(false);
    expect(canTransition("CREATED", "PAID", "ADMIN")).toBe(false);
    expect(canTransition("AWAITING_PAYMENT", "PAID", "ADMIN")).toBe(false);
    expect(canTransition("AWAITING_PAYMENT", "PAID", "PAYMENT")).toBe(true);
    expect(canTransition("SHIPPED", "CANCELLED", "ADMIN")).toBe(false);
  });
});

describe("tarne", () => {
  const [method] = availableShippingMethods({ ...DEFAULT_SETTINGS.delivery, freeShippingThresholdCents: 100_000 });

  it("standardtarne seadetest; tasuta tarne piir ja tasuta tarne kood", () => {
    expect(method).toMatchObject({ code: "STANDARD", name: "Standardtarne", priceCents: 700, requiresPickupPoint: false });
    expect(quoteShipping(method, 50_000, false)).toMatchObject({ amountCents: 700, freeReason: null });
    expect(quoteShipping(method, 100_000, false)).toMatchObject({ amountCents: 0, freeReason: "THRESHOLD" });
    expect(quoteShipping(method, 1_000, true)).toMatchObject({ amountCents: 0, freeReason: "COUPON" });
    const [noThreshold] = availableShippingMethods(DEFAULT_SETTINGS.delivery);
    expect(quoteShipping(noThreshold, 999_999, false).amountCents).toBe(700); // tasuta tarnet ei ole kõvakodeeritud
  });
});

describe("kassa voog brauseris", () => {
  it("21. ostukorv tühjendatakse ainult pärast serveri kinnitust", () => {
    const deps = { clearCart: vi.fn(), forgetAttempt: vi.fn(), navigate: vi.fn() };
    expect(handlePlaceOrderResult({ ok: false, kind: "ERROR", message: "x", errorId: "AB12" }, deps)).toBe("STAY");
    expect(handlePlaceOrderResult({ ok: false, kind: "VALIDATION", fieldErrors: { email: "x" }, message: "x" }, deps)).toBe("STAY");
    expect(deps.clearCart).not.toHaveBeenCalled();
    expect(handlePlaceOrderResult({ ok: true, orderNumber: "SL-26-ABCDEF", existing: false }, deps)).toBe("DONE");
    expect(deps.clearCart).toHaveBeenCalledTimes(1);
    expect(deps.navigate).toHaveBeenCalledWith("/tellimus/SL-26-ABCDEF/kinnitus");
  });
});

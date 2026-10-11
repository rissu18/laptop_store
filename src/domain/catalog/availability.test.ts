import { describe, expect, it } from "vitest";
import { UNKNOWN_QUANTITY_LIMIT_MESSAGE, isQuantityUnknown, orderQuantityLimit, resolveStock, stockLabel } from "./availability";

describe("laoseisu semantika", () => {
  it("Laptopid: nimekirjas = saadaval, täpne kogus TEADMATA (mitte 1)", () => {
    const stock = resolveStock({ stock: null, available: true });
    expect(stock).toEqual({ available: true, quantity: null });
    expect(isQuantityUnknown(stock)).toBe(true);
  });

  it("tulevane tarnija täpse kogusega: available + quantity", () => {
    expect(resolveStock({ stock: 7, available: true })).toEqual({ available: true, quantity: 7 });
  });

  it("puudus täielikust snapshot'ist → ei ole saadaval; vana mock (ainult kogus) töötab nagu enne", () => {
    expect(resolveStock({ stock: null, available: false }).available).toBe(false);
    expect(resolveStock({ stock: 3, available: null })).toEqual({ available: true, quantity: 3 });
    expect(resolveStock({ stock: 0, available: null }).available).toBe(false);
    expect(resolveStock({ stock: null, available: null }).available).toBe(false);
  });

  it("teadmata kogus → automaatselt max 1 rea kohta; teada kogus → kuni 10", () => {
    expect(orderQuantityLimit({ available: true, quantity: null })).toBe(1);
    expect(orderQuantityLimit({ available: true, quantity: 7 })).toBe(7);
    expect(orderQuantityLimit({ available: true, quantity: 40 })).toBe(10);
    expect(orderQuantityLimit({ available: false, quantity: null })).toBe(0);
  });

  it("kliendi tekst ei väida kunagi '1 tk', kui kogus on teadmata", () => {
    expect(stockLabel({ available: true, quantity: null })).toBe("Kohe saadaval");
    expect(stockLabel({ available: true, quantity: null })).not.toMatch(/\d\s*tk/);
    expect(stockLabel({ available: true, quantity: 5 })).toBe("Partnerlaos 5 tk");
    expect(UNKNOWN_QUANTITY_LIMIT_MESSAGE).toMatch(/võta meiega ühendust/);
    expect(UNKNOWN_QUANTITY_LIMIT_MESSAGE).not.toMatch(/ainult üks|1 tk/i);
  });
});

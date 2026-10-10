import { beforeEach, describe, expect, it } from "vitest";
import { resolveCart } from "./cart-actions";

/**
 * "Lisa korvi" peab lisama TÄPSELT kaardil oleva konfiguratsiooni (SupplierListing),
 * mitte sama mudeli vaikimisi varianti.
 */

// Brauseri localStorage asendus, et testida päris cart-store'i
const storage = new Map<string, string>();
beforeEach(() => {
  storage.clear();
  (globalThis as unknown as { window: unknown }).window = {
    localStorage: {
      getItem: (k: string) => storage.get(k) ?? null,
      setItem: (k: string, v: string) => storage.set(k, v),
    },
    addEventListener() {},
    removeEventListener() {},
  };
});

describe("ostukorv", () => {
  it("lisab täpselt valitud konfiguratsiooni ID", async () => {
    const { addToCart } = await import("@/client/cart-store");
    addToCart("mock-ms-10233"); // T14 Gen 3, i5-1245U / 16 GB / 256 GB (mitte mudeli odavaim/esimene)
    expect(JSON.parse(storage.get("cart:v1")!)).toEqual([{ variantId: "mock-ms-10233", quantity: 1 }]);
  });

  it("serveris arvutatud rida vastab täpselt sellele konfiguratsioonile, SKU-le ja hinnale", async () => {
    const cart = await resolveCart([{ variantId: "mock-ms-10232", quantity: 1 }]);
    expect(cart.lines).toHaveLength(1);
    const { item } = cart.lines[0];
    expect(item.product.slug).toBe("lenovo-thinkpad-t14-gen-3");
    expect(item.variant).toMatchObject({ id: "mock-ms-10232", sku: "SP-10232", ramGb: 32, storageGb: 1024 });
    expect(cart.subtotalCents).toBe(item.variant.price.saleCents);
  });

  it("sama mudeli eri konfiguratsioonid on ostukorvis eraldi ridadena oma hinnaga", async () => {
    const cart = await resolveCart([
      { variantId: "mock-ms-10231", quantity: 1 },
      { variantId: "mock-ms-10232", quantity: 1 },
    ]);
    const [a, b] = cart.lines.map((l) => l.item.variant);
    expect(a.sku).not.toBe(b.sku);
    expect(a.price.saleCents).not.toBe(b.price.saleCents);
  });
});

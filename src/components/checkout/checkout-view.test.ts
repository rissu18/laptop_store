import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { TERMS_HREF } from "@/domain/checkout/checkout-form";

/**
 * Kassa vormi tingimuste märkeruut (kliendikomponent; Vitest jookseb node keskkonnas, seega kontrollitakse
 * lähtekoodi). Nõustumise kohustuslikkust kontrollivad ka parseCheckoutForm ja placeOrderAction testid.
 */
const source = readFileSync(fileURLToPath(new URL("./checkout-view.tsx", import.meta.url)), "utf8");

describe("kassa: E-poe tingimuste märkeruut", () => {
  it("märkeruut on olemas, nimega acceptTerms, ja vaikimisi märkimata", () => {
    const input = source.match(/<input\s[^>]*name="acceptTerms"[^>]*\/>/)?.[0];
    expect(input).toBeDefined();
    expect(input).toContain('type="checkbox"');
    expect(input).toContain("defaultChecked={false}");
    expect(input).not.toMatch(/\bchecked=|defaultChecked(?!=\{false\})/);
  });

  it("tekst „Olen tutvunud ja nõustun E-poe tingimustega.“ ja link E-poe tingimustele", () => {
    expect(source).toMatch(/Olen tutvunud ja nõustun\{" "\}\s*<Link href=\{TERMS_HREF\}[^>]*>\s*E-poe tingimustega\s*<\/Link>\s*\./);
    expect(TERMS_HREF).toBe("/info/muugitingimused");
  });

  it("vormi väärtus saadetakse serverisse (acceptTerms) ja viga kuvatakse kliendile", () => {
    expect(source).toContain('acceptTerms: data.get("acceptTerms") === "on"');
    expect(source).toContain("errors.acceptTerms");
  });
});

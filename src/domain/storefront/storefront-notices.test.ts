import { describe, expect, it } from "vitest";
import type { TrustItem } from "@/config/store";
import { DEFAULT_SETTINGS } from "@/domain/settings/settings";
import { PAYMENTS_PENDING_TRUST_ITEM, PROTOTYPE_NOTICE, storefrontTrustItems } from "./storefront-notices";

describe("prototüübi riba", () => {
  const full = `${PROTOTYPE_NOTICE.label} ${PROTOTYPE_NOTICE.text}`;

  it("ei nimeta päris kataloogi andmeid (tooted, hinnad, laoseis) testandmeteks", () => {
    expect(full).not.toMatch(/testandme|näidisandme|arenduse/i);
    expect(full).toMatch(/toodete, hindade ja saadavuse andmed on live/);
  });

  it("hoiatab endiselt: tellimused on testtellimused, makseid ei võeta", () => {
    expect(full).toMatch(/Tellimused on testtellimused/);
    expect(full).toMatch(/makseid ei võeta/);
  });
});

describe("usaldusriba makse-punkt", () => {
  const items: TrustItem[] = DEFAULT_SETTINGS.trustBar.items.map((i) => ({ key: i.key, title: i.label, detail: i.text }));

  it("maksed pole avatud → ei väida pangalinke ega turvalist maksmist", () => {
    const shown = storefrontTrustItems(items, false);
    const payment = shown.find((i) => i.key === "payment");
    expect(payment).toMatchObject(PAYMENTS_PENDING_TRUST_ITEM);
    expect(JSON.stringify(shown)).not.toMatch(/Pangalingid|kaardimakse|Turvaline maksmine/);
    // Teised punktid jäävad admini sõnastusse ja järjekorda
    expect(shown.map((i) => i.key)).toEqual(items.map((i) => i.key));
    expect(shown.find((i) => i.key === "returns")).toEqual(items.find((i) => i.key === "returns"));
  });

  it("LIVE maksetega kuvatakse admini tekst muutmata", () => {
    expect(storefrontTrustItems(items, true)).toEqual(items);
  });

  it("admin on makse-punkti peitnud → seda ei lisata", () => {
    const withoutPayment = items.filter((i) => i.key !== "payment");
    expect(storefrontTrustItems(withoutPayment, false)).toEqual(withoutPayment);
  });
});

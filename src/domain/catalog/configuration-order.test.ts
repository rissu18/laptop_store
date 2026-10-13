import { describe, expect, it } from "vitest";
import { deliveryShortLabel } from "./configuration-line";
import { compareConfigurations, defaultConfiguration, isInStore, sortConfigurations } from "./configuration-order";
import type { CatalogVariant } from "./types";

type Kind = "LOCAL" | "TECH" | "FOXWAY";

/** LOCAL = Laptopid.ee salong (kogus teadmata, tarneaega pole); TECH 1–2 päeva; FOXWAY 2–4 päeva */
const config = (sku: string, kind: Kind, euros: number, over: Partial<CatalogVariant> = {}) =>
  ({
    id: `id-${sku}`,
    sku,
    price: { saleCents: euros * 100, referenceCents: null, vatScheme: "MARGIN" },
    stock: kind === "LOCAL" ? { available: true, quantity: null } : { available: true, quantity: 3 },
    delivery: kind === "LOCAL" ? null : kind === "TECH" ? { minDays: 1, maxDays: 2 } : { minDays: 2, maxDays: 4 },
    ...over,
  }) as CatalogVariant;

const order = (variants: CatalogVariant[]) => sortConfigurations(variants).map((v) => v.sku);

describe("konfiguratsioonide järjestus", () => {
  it("local 590 € tuleb enne Foxway 282 €", () => {
    expect(order([config("FOX-282", "FOXWAY", 282), config("LOC-590", "LOCAL", 590)])).toEqual(["LOC-590", "FOX-282"]);
  });

  it("local 590, local 620, Foxway 282, Tech 438 → 590, 620, 282, 438", () => {
    const variants = [config("TECH-438", "TECH", 438), config("LOC-620", "LOCAL", 620), config("FOX-282", "FOXWAY", 282), config("LOC-590", "LOCAL", 590)];
    expect(order(variants)).toEqual(["LOC-590", "LOC-620", "FOX-282", "TECH-438"]);
  });

  it("kohapeal grupi sees hind kasvavalt", () => {
    expect(order([config("L-849", "LOCAL", 849), config("L-590", "LOCAL", 590), config("L-620", "LOCAL", 620)])).toEqual(["L-590", "L-620", "L-849"]);
  });

  it("tarnel grupi sees hind kasvavalt sõltumata tarnijast", () => {
    const variants = [config("T-660", "TECH", 660), config("F-438", "FOXWAY", 438), config("T-590", "TECH", 590), config("F-282", "FOXWAY", 282)];
    expect(order(variants)).toEqual(["F-282", "F-438", "T-590", "T-660"]);
  });

  it("1–2 päeva tarne EI saa eelist 2–4 päeva ees — hind otsustab", () => {
    const variants = [config("T-620", "TECH", 620), config("F-660", "FOXWAY", 660), config("F-590", "FOXWAY", 590)];
    expect(order(variants)).toEqual(["F-590", "T-620", "F-660"]);
  });

  it("võrdne hind → stabiilne SKU järjekord, sisendi järjekorrast sõltumatu", () => {
    const a = config("B-500", "FOXWAY", 500);
    const b = config("A-500", "TECH", 500);
    expect(order([a, b])).toEqual(["A-500", "B-500"]);
    expect(order([b, a])).toEqual(["A-500", "B-500"]);
    expect(compareConfigurations(a, a)).toBe(0);
  });

  it('"Poes kohapeal" järjestus ja silt kasutavad sama reeglit', () => {
    for (const kind of ["LOCAL", "TECH", "FOXWAY"] as const) {
      const variant = config("X", kind, 100);
      expect(deliveryShortLabel(variant) === "Poes kohapeal").toBe(isInStore(variant));
    }
  });
});

describe("vaikimisi valitud konfiguratsioon", () => {
  it("kohapeal variandi puudumisel: odavaim tarnel variant on esimene ja vaikimisi valitud", () => {
    const variants = [config("T-438", "TECH", 438), config("F-282", "FOXWAY", 282)];
    expect(sortConfigurations(variants)[0].sku).toBe("F-282");
    expect(defaultConfiguration(variants)?.sku).toBe("F-282");
  });

  it("kohapeal variant olemas: odavaim kohapeal variant (mitte kogu mudeli odavaim)", () => {
    const variants = [config("F-282", "FOXWAY", 282), config("F-438", "FOXWAY", 438), config("L-620", "LOCAL", 620), config("L-590", "LOCAL", 590)];
    expect(defaultConfiguration(variants)?.sku).toBe("L-590");
  });

  it("otsas pakkumist vaikimisi ei valita", () => {
    const variants = [config("L-590", "LOCAL", 590, { stock: { available: false, quantity: null } }), config("F-282", "FOXWAY", 282)];
    expect(defaultConfiguration(variants)?.sku).toBe("F-282");
  });

  it("tühi nimekiri → undefined", () => {
    expect(defaultConfiguration([])).toBeUndefined();
  });
});

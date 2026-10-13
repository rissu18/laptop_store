import { describe, expect, it } from "vitest";
import { roundToEuro } from "@/domain/money/money";
import { configurationDetails, configurationSpecLine, deliveryShortLabel, gradeShortLabel, resolutionShortLabel } from "./configuration-line";
import type { CatalogVariant } from "./types";

const variant = (over: Partial<CatalogVariant> = {}) =>
  ({
    cpu: { model: "Intel Core i5-1345U" },
    ramGb: 16,
    storageGb: 256,
    grade: "A",
    keyboardLayout: "SCA",
    display: { resolution: "1920x1200", resolutionLabel: "WUXGA", panel: null, touch: false },
    stock: { available: true, quantity: 3 },
    delivery: { minDays: 2, maxDays: 4 },
    ...over,
  }) as unknown as CatalogVariant;

describe("konfiguratsioonirida", () => {
  it('"i5-1345U · 16 GB · 256 GB" ja "Seisukord A · Skandinaavia (SCA) · 14" · WUXGA · Tarne 2–4 päeva"', () => {
    expect(configurationSpecLine(variant())).toBe("i5-1345U · 16 GB · 256 GB");
    expect(configurationDetails({ screenSizeIn: 14 }, variant()).join(" · ")).toBe('Seisukord A · Skandinaavia (SCA) · 14" · WUXGA · Tarne 2–4 päeva');
  });

  it("seisukord ilma pika selgituseta", () => {
    expect(gradeShortLabel("A+")).toBe("Seisukord A+");
    expect(gradeShortLabel("B")).toBe("Seisukord B");
    expect(gradeShortLabel("C")).toBe("Seisukord C");
    expect(gradeShortLabel("NEW")).toBe("Uus");
  });

  it("tarneaeg inimkeeles: salong / Tech / Foxway", () => {
    expect(deliveryShortLabel({ stock: { available: true, quantity: null }, delivery: null } as never)).toBe("Poes kohapeal");
    expect(deliveryShortLabel({ stock: { available: true, quantity: 4 }, delivery: { minDays: 1, maxDays: 2 } } as never)).toBe("Tarne 1–2 päeva");
    expect(deliveryShortLabel({ stock: { available: true, quantity: 4 }, delivery: { minDays: 2, maxDays: 4 } } as never)).toBe("Tarne 2–4 päeva");
  });

  it("resolutsioon: nimi või mõõdud", () => {
    expect(resolutionShortLabel({ resolution: "1920x1080", resolutionLabel: null, panel: null, touch: false })).toBe("1920 × 1080");
    expect(resolutionShortLabel({ resolution: null, resolutionLabel: null, panel: null, touch: false })).toBeNull();
  });

  it("kliendi hind täiseurodes: tavaline ümardamine", () => {
    expect(roundToEuro(75812)).toBe(75800);
    expect(roundToEuro(15052)).toBe(15100);
    expect(roundToEuro(15050)).toBe(15100);
    expect(roundToEuro(42900)).toBe(42900);
  });
});

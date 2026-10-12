import { describe, expect, it } from "vitest";
import { pricingConfig } from "@/config/pricing";
import { rangeToFilter, roundRange } from "@/components/catalog/price-range-slider";
import { MockSupplierAdapter } from "@/integrations/supplier/mock/mock-supplier-adapter";
import type { NormalizedOffer } from "@/integrations/supplier/normalized-offer";
import { buildCatalog } from "@/server/catalog/build-catalog";
import { FEATURE_LABELS } from "./features";
import { computeFacets, filterItems } from "./filtering";
import { emptyQuery, parseCatalogQuery } from "./query";
import { findSimilarItems, isWithinPriceRange } from "./similar";
import { buildSpecSections } from "./spec-sections";
import { explainCpu, explainKeyboard, explainRam, explainStorage } from "./spec-explanations";
import type { CatalogItem } from "./types";

async function catalog() {
  const source = await new MockSupplierAdapter().getProducts();
  return buildCatalog(source, { pricing: pricingConfig, featuredExternalIds: [], lastSyncedAt: null }).items;
}

const find = (items: CatalogItem[], sku: string) => items.find((i) => i.variant.sku === sku)!;

describe("1. hinnavahemiku filter", () => {
  it("liuguri piirid ümardatakse 10 € sammule ja tulevad kataloogist", async () => {
    const items = await catalog();
    const price = computeFacets(items as never, emptyQuery()).price!;
    const prices = items.map((i) => i.variant.price.saleCents / 100);
    expect(price).toEqual({ min: Math.floor(Math.min(...prices)), max: Math.ceil(Math.max(...prices)) });
    expect(roundRange({ min: 209, max: 1199 })).toEqual({ min: 200, max: 1200 });
  });

  it("kataloogi piiriga kokkulangev käepide tähendab 'filtrit pole'", () => {
    expect(rangeToFilter(200, 1200, { min: 200, max: 1200 })).toEqual({ min: null, max: null });
    expect(rangeToFilter(300, 800, { min: 200, max: 1200 })).toEqual({ min: 300, max: 800 });
  });

  it("filtreerib hinna järgi ja URL-ist tulev vahemik loetakse õigesti", async () => {
    const items = await catalog();
    const query = parseCatalogQuery({ min: "300", max: "500" });
    const found = filterItems(items as never, query);
    expect(found.length).toBeGreaterThan(0);
    for (const item of found) {
      expect(item.variant.price.saleCents).toBeGreaterThanOrEqual(30_000);
      expect(item.variant.price.saleCents).toBeLessThanOrEqual(50_000);
    }
  });
});

describe("4. sarnased sülearvutid", () => {
  it("kõik soovitused on ±25% hinnavahemikus ja mitte sama mudel", async () => {
    const items = await catalog();
    for (const current of items) {
      const similar = findSimilarItems(current, items);
      expect(similar.length).toBeLessThanOrEqual(4);
      for (const s of similar) {
        expect(isWithinPriceRange(current, s)).toBe(true);
        const ratio = s.variant.price.saleCents / current.variant.price.saleCents;
        expect(ratio).toBeGreaterThanOrEqual(0.75);
        expect(ratio).toBeLessThanOrEqual(1.25);
        expect(s.product.slug).not.toBe(current.product.slug);
        expect(s.variant.id).not.toBe(current.variant.id);
      }
      expect(new Set(similar.map((s) => s.product.slug)).size).toBe(similar.length);
    }
  });

  it("ei piira sama tootjaga — soovitab ka teisi brände", async () => {
    const items = await catalog();
    const t14 = find(items, "SP-10231"); // Lenovo ThinkPad T14 Gen 3
    const brands = new Set(findSimilarItems(t14, items).map((s) => s.product.brand));
    expect([...brands].some((b) => b !== "lenovo")).toBe(true);
  });

  it("kui vahemikus pole piisavalt tooteid, ei pakuta kallimaid/odavamaid asendajaid", async () => {
    const items = await catalog();
    const cheapest = [...items].sort((a, b) => a.variant.price.saleCents - b.variant.price.saleCents)[0];
    const similar = findSimilarItems(cheapest, items);
    for (const s of similar) expect(s.variant.price.saleCents).toBeLessThanOrEqual(cheapest.variant.price.saleCents * 1.25);
  });
});

describe("2. kiirinfo selgitused", () => {
  it("on deterministlikud ja sõltuvad väärtusest", async () => {
    const items = await catalog();
    const t14 = find(items, "SP-10231");
    expect(explainRam(t14)).toBe("Hea igapäevaseks multitaskinguks");
    expect(explainStorage(t14)).toBe("Hea tasakaal mahu ja hinna vahel");
    expect(explainCpu(t14)).toBe("Sobib igapäevatööks ja kontoritööks");
    expect(explainKeyboard(t14)).toBe("Rootsi/Soome paigutus");
    expect(explainCpu(find(items, "SP-20160"))).toMatch(/H-seeria/); // i7-11850H
  });
});

describe("3. tehnilised andmed", () => {
  it("Jõudlus näitab protsessori täisnime, mälu ja salvestuse päris ridadena (2026-10-12) ja protsessori põlvkonna", async () => {
    const t14 = find(await catalog(), "SP-10231");
    const rows = buildSpecSections(t14).flatMap((s) => s.rows);
    const labels = rows.map((r) => r.label);
    expect(labels.slice(0, 1)).toEqual(["Protsessor"]);
    expect(rows[0].value).toBe(t14.variant.cpu.model);
    expect(labels).toContain("Mälu");
    expect(labels).toContain("Salvestus");
    expect(rows.find((r) => r.label === "Protsessori põlvkond")?.value).toBe("Intel 12. põlvkond");
  });

  it("puuduvad väärtused ei tekita tühje ridu ega tühje gruppe", async () => {
    const t14 = find(await catalog(), "SP-10231");
    const sparse: CatalogItem = {
      product: { ...t14.product, weightKg: null, wifi: null, bluetooth: null, ports: { usbA: null, usbC: null } },
      variant: {
        ...t14.variant,
        cpu: { ...t14.variant.cpu, generationKey: null },
        ramType: null,
        os: "N/A",
        batteryHealthPct: null,
        chargerIncluded: null,
        warrantyMonths: null,
        features: Object.fromEntries(Object.keys(t14.variant.features).map((k) => [k, null])) as never,
        display: { ...t14.variant.display, touch: null, panel: "-" },
      },
    };
    const sections = buildSpecSections(sparse);
    for (const section of sections) {
      expect(section.rows.length).toBeGreaterThan(0);
      for (const row of section.rows) expect(["", "-", "N/A", "null", "undefined", "Unknown"]).not.toContain(row.value);
    }
    const labels = sections.flatMap((s) => s.rows.map((r) => r.label));
    expect(labels).not.toContain("Protsessori põlvkond");
    expect(labels).not.toContain("Operatsioonisüsteem");
    expect(labels).not.toContain("Paneel");
    expect(sections.find((s) => s.title === "Turvalisus")).toBeUndefined(); // kõik väärtused teadmata
  });
});

describe("8. Smart Card nimetus", () => {
  it("kasutab nimetust 'Smart Card lugeja', mitte 'ID-kaardilugeja'", async () => {
    expect(FEATURE_LABELS.smartcard).toBe("Smart Card lugeja");
    const rows = buildSpecSections(find(await catalog(), "SP-10231")).flatMap((s) => s.rows);
    expect(rows.some((r) => r.label === "Smart Card lugeja")).toBe(true);
    expect(rows.some((r) => /ID-kaardi/i.test(r.label))).toBe(false);
  });
});

describe("8. puuduvad andmed ei saa võltsitud vaikeväärtusi", () => {
  it("tarnija pakkumine ilma garantii/aku/OS/laadija/tarneajata jääb null väärtustega", async () => {
    const { offers } = await new MockSupplierAdapter().getProducts();
    const bare: NormalizedOffer = {
      ...offers[0],
      externalId: "BARE-1",
      warrantyMonths: null,
      batteryHealthPct: null,
      os: null,
      chargerIncluded: null,
      deliveryDays: null,
    };
    const [item] = buildCatalog({ offers: [bare], rejected: [] }, { pricing: pricingConfig, featuredExternalIds: [], lastSyncedAt: null }).items;
    expect(item.variant).toMatchObject({ warrantyMonths: null, batteryHealthPct: null, os: null, chargerIncluded: null, delivery: null });
    const labels = buildSpecSections(item).flatMap((s) => s.rows.map((r) => r.label));
    for (const label of ["Garantii", "Aku seisukord", "Operatsioonisüsteem", "Laadija komplektis"]) expect(labels).not.toContain(label);
  });
});

import { existsSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { getInfoPage } from "@/config/info-pages";
import { pricingConfig } from "@/config/pricing";
import { MAIN_NAV } from "@/components/layout/navigation";
import { MockSupplierAdapter } from "@/integrations/supplier/mock/mock-supplier-adapter";
import { buildCatalog } from "@/server/catalog/build-catalog";
import { summarizeBusinessSeries } from "@/domain/catalog/business-series";
import { modelFit } from "@/domain/catalog/model-fit";
import type { BrandCode, CatalogItem } from "@/domain/catalog/types";
import { finderHrefForPurpose, parsePurpose, PURPOSES } from "@/domain/finder/finder";
import { HERO_CTAS, isImmediatelyAvailable, roundedCountLabel, SHOWROOM } from "./showroom";

async function baseItem(): Promise<CatalogItem> {
  const source = await new MockSupplierAdapter().getProducts();
  return buildCatalog(source, { pricing: pricingConfig, featuredExternalIds: [], lastSyncedAt: null }).items[0];
}

type VariantPatch = Partial<Omit<CatalogItem["variant"], "features" | "gpu" | "cpu">> & {
  features?: Partial<CatalogItem["variant"]["features"]>;
  gpu?: Partial<CatalogItem["variant"]["gpu"]>;
  cpu?: Partial<CatalogItem["variant"]["cpu"]>;
};

function withSpecs(base: CatalogItem, product: Partial<CatalogItem["product"]>, variant: VariantPatch): CatalogItem {
  return {
    product: { ...base.product, ...product },
    variant: {
      ...base.variant,
      ...variant,
      features: { ...base.variant.features, ...variant.features },
      gpu: { ...base.variant.gpu, ...variant.gpu },
      cpu: { ...base.variant.cpu, ...variant.cpu },
    },
  };
}

describe("salong: tõestatavad arvud", () => {
  it("ümardab allapoole täissajani, alla 100 täpne, 0 → väidet pole", () => {
    expect(roundedCountLabel(305)).toBe("300+");
    expect(roundedCountLabel(100)).toBe("100+");
    expect(roundedCountLabel(99)).toBe("99");
    expect(roundedCountLabel(0)).toBeNull();
  });

  it("kohe saadaval = saadaval + teadmata kogus (Laptopid); täpse kogusega = partneri ladu", () => {
    expect(isImmediatelyAvailable({ available: true, quantity: null })).toBe(true);
    expect(isImmediatelyAvailable({ available: true, quantity: 4 })).toBe(false);
    expect(isImmediatelyAvailable({ available: false, quantity: null })).toBe(false);
  });

  it("aadress ja lahtiolekuaeg tulevad ettevõtte andmetest", () => {
    expect(SHOWROOM.addressShort).toBe("Tartu mnt 83, Tallinn");
    expect(SHOWROOM.hours).toBe("E–R 10:00–18:00");
    expect(SHOWROOM.contactHref).toBe("/info/kontakt");
  });
});

describe("avaleht ja navigatsioon: marsruudid", () => {
  const appPage = (route: string) => existsSync(join(process.cwd(), "src/app/(shop)", route, "page.tsx"));

  it("hero CTA-d viivad kataloogi, olemasolevasse leidjasse ja avalehe salongiplokki", () => {
    expect(HERO_CTAS.primary.href).toBe("/sulearvutid");
    expect(HERO_CTAS.finder.href).toBe("/leia-sobiv");
    expect(HERO_CTAS.showroom.href).toBe("#salong");
    expect(appPage("sulearvutid") && appPage("leia-sobiv")).toBe(true);
  });

  it("põhimenüüs on salongi link Kontakt-lehele; kõik menüü lingid on olemasolevad lehed", () => {
    expect(MAIN_NAV.find((item) => item.showroom)).toEqual({ href: "/info/kontakt", label: "Salong ja kontakt", showroom: true });
    expect(MAIN_NAV.map((item) => item.label)).toEqual(["Sülearvutid", "Parimad pakkumised", "Lenovo", "Dell", "HP", "Leia sobiv", "Salong ja kontakt"]);
    for (const { href } of MAIN_NAV) {
      const route = href.startsWith("/info/") ? "info/[slug]" : href.startsWith("/sulearvutid/") ? "sulearvutid/[brand]" : href.slice(1);
      expect(appPage(route)).toBe(true);
    }
    expect(getInfoPage("kontakt")?.showroom?.photo).toBe("contact");
    expect(getInfoPage("meist")?.showroom?.photo).toBe("detail");
  });

  it("salongifotod on optimeeritud WebP-d (originaale 1.jpg … 8.jpg public/ all pole)", () => {
    for (const name of ["showroom-hero", "showroom-wide", "showroom-contact", "showroom-detail"]) {
      const file = join(process.cwd(), "public/brand/showroom", `${name}.webp`);
      expect(existsSync(file)).toBe(true);
      expect(statSync(file).size).toBeLessThan(300 * 1024);
    }
    expect(existsSync(join(process.cwd(), "public/brand/showroom/5.jpg"))).toBe(false);
  });
});

describe("avaleht: leidja eesmärgid", () => {
  it("iga eesmärk viib olemasolevasse leidjasse; tundmatu väärtus ignoreeritakse", () => {
    for (const purpose of PURPOSES) {
      expect(finderHrefForPurpose(purpose.key)).toBe(`/leia-sobiv?eesmark=${purpose.key}`);
      expect(parsePurpose(purpose.key)).toBe(purpose.key);
    }
    expect(parsePurpose("gaming")).toBeNull();
    expect(parsePurpose(["work"])).toBeNull();
    expect(parsePurpose(undefined)).toBeNull();
  });
});

describe("avaleht: populaarsed äriklassi seeriad", () => {
  it("ainult kataloogis olevad seeriad, tootjate ja nimekirja järjekorras, filtri seeria väärtusega", async () => {
    const base = await baseItem();
    const make = (id: string, brand: BrandCode, series: string, model: string, cents: number, available = true) =>
      withSpecs(base, { brand, series, model }, { id, price: { ...base.variant.price, saleCents: cents }, stock: { available, quantity: null } });
    const items = [
      make("1", "hp", "EliteBook", "840 G8", 60000),
      make("2", "lenovo", "ThinkPad", "X1 Carbon Gen 9", 80000),
      make("3", "lenovo", "ThinkPad", "T14 Gen 3", 70000),
      make("4", "lenovo", "ThinkPad", "T14s Gen 2", 50000),
      make("5", "dell", "Latitude", "7440", 85000),
      make("6", "dell", "XPS", "13 9310", 30000), // XPS pole äriklassi nimekirjas
      make("7", "lenovo", "ThinkPad", "L14 Gen 1", 20000, false), // läbimüüdud ei loe
    ];
    const groups = summarizeBusinessSeries(items);
    expect(groups.map((g) => g.brand)).toEqual(["lenovo", "dell", "hp"]);
    expect(groups[0].series.map((s) => [s.label, s.count, s.minPriceCents, s.href])).toEqual([
      ["ThinkPad T", 2, 50000, "/sulearvutid/lenovo?series=thinkpad-t"],
      ["ThinkPad X1", 1, 80000, "/sulearvutid/lenovo?series=thinkpad-x1"],
    ]);
    expect(groups[1].series.map((s) => s.label)).toEqual(["Latitude"]);
    expect(summarizeBusinessSeries(items, 2).map((g) => g.brand)).toEqual(["lenovo"]);
  });
});

describe("tooteleht: Miks valida see mudel?", () => {
  it("võimsa kerge arendusarvuti põhjused tulevad spetsifikatsioonist", async () => {
    const base = await baseItem();
    const fit = modelFit(
      withSpecs(base, { screenSizeIn: 14, weightKg: 1.2 }, {
        weightKg: null,
        ramGb: 32,
        storageGb: 1024,
        cpu: { family: "intel-core-i7", model: "Intel Core i7-1365U" },
        gpu: { dedicated: false, model: "Intel Iris Xe" },
        features: { lte: true, numpad: false },
      }),
    );
    expect(fit?.goodFor).toEqual(["kontoritööks ja kaugtööks", "igapäevaseks kaasaskandmiseks", "tööks liikvel (mobiilne internet)", "programmeerimiseks"]);
    expect(fit?.considerStronger).toEqual(["vajad eraldi graafikakaarti (nt NVIDIA) 3D- või videotööks"]);
  });

  it("teadmata kaalu ega CPU klassi korral väidet ei tehta; alla 2 põhjuse → plokki pole", async () => {
    const base = await baseItem();
    const unknown = withSpecs(base, { screenSizeIn: 14, weightKg: null }, {
      weightKg: null,
      ramGb: 8,
      storageGb: 256,
      cpu: { family: null, model: "Tundmatu CPU" },
      gpu: { dedicated: false, model: "" },
      features: { lte: null, "5g": null, numpad: null },
    });
    expect(modelFit(unknown)).toBeNull();
  });
});

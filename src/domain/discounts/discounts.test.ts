import { describe, expect, it } from "vitest";
import { pricingConfig } from "@/config/pricing";
import { calculatePrice, minimumAllowedPrice } from "@/domain/pricing/pricing-engine";
import { formatTallinnDateTime, tallinnLocalToUtc, toTallinnLocalInput } from "@/domain/time/tallinn";
import { copyCodeCandidates, generateCode, normalizeCode, validateCodeFormat } from "./code";
import {
  allocateProportionally,
  buildDiscountSnapshot,
  effectiveDiscountStatus,
  evaluateDiscount,
  formatDiscountValue,
  type DiscountCartLine,
  type DiscountRule,
} from "./discount-engine";
import { discountFormToObject, parseDiscountForm } from "./discount-form";

const NOW = new Date("2026-10-20T12:00:00Z");
/** Intl vormindab summa murdumatu tühikuga ("700 €") — võrdlemiseks tavaliseks tühikuks */
const plain = (text: string | false | undefined) => (typeof text === "string" ? text.replace(/ /g, " ") : text);

function rule(over: Partial<DiscountRule> = {}): DiscountRule {
  return {
    code: "KOOL75",
    normalizedCode: "KOOL75",
    type: "FIXED_AMOUNT",
    value: 7500,
    status: "ACTIVE",
    startsAt: null,
    expiresAt: null,
    minimumSubtotalCents: null,
    maximumDiscountCents: null,
    usageLimit: null,
    usageCount: 0,
    scope: "ALL_PRODUCTS",
    manufacturers: [],
    productModels: [],
    listings: [],
    excludedProductModels: [],
    excludedListings: [],
    respectMinimumMargin: false,
    ...over,
  };
}

const line = (over: Partial<DiscountCartLine> = {}): DiscountCartLine => ({
  listing: "SP-1",
  productModel: "dell-latitude-5420",
  manufacturer: "dell",
  unitPriceCents: 50_000,
  quantity: 1,
  ...over,
});

const percent = (pct: number, over: Partial<DiscountRule> = {}) => rule({ code: "SÜGIS10", normalizedCode: "SÜGIS10", type: "PERCENTAGE", value: pct * 100, ...over });

describe("sooduskoodi tekst", () => {
  it("on tõstutundetu: KOOL75 = kool75 = Kool75 = '  kool75 '", () => {
    expect(new Set(["KOOL75", "kool75", "Kool75", "  kool75 "].map(normalizeCode))).toEqual(new Set(["KOOL75"]));
    expect(normalizeCode("sügis10")).toBe("SÜGIS10");
    expect(normalizeCode("ＫＯＯＬ７５")).toBe("KOOL75"); // täislaiusega märgid (NFKC)
  });

  it("vorming: tühikud, erimärgid ja pikkus", () => {
    expect(validateCodeFormat("GARANTII")).toBeNull();
    expect(validateCodeFormat("SÜGIS10")).toBeNull();
    expect(validateCodeFormat("SAVE-X7K4P2")).toBeNull();
    expect(validateCodeFormat("AB")).toMatch(/vähemalt/);
    expect(validateCodeFormat("KOOL 75")).toMatch(/ainult/);
    expect(validateCodeFormat("<script>")).toMatch(/ainult/);
    expect(validateCodeFormat("A".repeat(41))).toMatch(/kuni/);
  });

  it("genereeritud kood: SAVE-XXXXXX ilma segiaetavate märkideta, unikaalne", () => {
    const codes = Array.from({ length: 200 }, () => generateCode());
    for (const code of codes) expect(code).toMatch(/^SAVE-[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{6}$/);
    expect(new Set(codes).size).toBe(200);
  });

  it("duplikaadi koodid", () => {
    expect(copyCodeCandidates("kool75").slice(0, 2)).toEqual(["KOOL75-COPY", "KOOL75-COPY2"]);
    expect(copyCodeCandidates("KOOL75-COPY")[0]).toBe("KOOL75-COPY");
  });
});

describe("DiscountEngine: summad", () => {
  it("PROTSENT: 500 € × 10% = 50 €", () => {
    const r = evaluateDiscount(percent(10), [line()], NOW);
    expect(r.valid && r.discountAmountCents).toBe(5_000);
    expect(r.valid && r.totalCents).toBe(45_000);
  });

  it("FIKSEERITUD: 500 € − 75 € = 425 €", () => {
    const r = evaluateDiscount(rule(), [line()], NOW);
    expect(r.valid && r.discountAmountCents).toBe(7_500);
    expect(r.valid && r.totalCents).toBe(42_500);
  });

  it("MAKSIMUM: 1500 € × 10% = 150 € → max 100 €", () => {
    const r = evaluateDiscount(percent(10, { maximumDiscountCents: 10_000 }), [line({ unitPriceCents: 150_000 })], NOW);
    expect(r.valid && r.discountAmountCents).toBe(10_000);
    expect(r.valid && r.cappedByMaximum).toBe(true);
  });

  it("EI LÄHE NEGATIIVSEKS: 50 € ostukorv, 75 € kood → soodustus 50 €, kokku 0 €", () => {
    const r = evaluateDiscount(rule(), [line({ unitPriceCents: 5_000 })], NOW);
    expect(r.valid && r.discountAmountCents).toBe(5_000);
    expect(r.valid && r.totalCents).toBe(0);
  });

  it("MIINIMUMSUMMA: 650 € < 700 € → kehtetu koos selge teatega; 750 € → kehtib", () => {
    const save100 = rule({ code: "SAVE100", value: 10_000, minimumSubtotalCents: 70_000 });
    const low = evaluateDiscount(save100, [line({ unitPriceCents: 65_000 })], NOW);
    expect(low).toMatchObject({ valid: false, reason: "MINIMUM_SUBTOTAL" });
    expect(plain(!low.valid && low.message)).toBe("Sooduskoodi kasutamiseks peab ostukorvi summa olema vähemalt 700 €.");
    expect(evaluateDiscount(save100, [line({ unitPriceCents: 75_000 })], NOW).valid).toBe(true);
  });

  it("jaotus ridadele: sentide summa klapib täpselt", () => {
    expect(allocateProportionally(1000, [1, 1, 1])).toEqual([334, 333, 333]);
    expect(allocateProportionally(7500, [50_000, 0, 25_000]).reduce((a, b) => a + b)).toBe(7500);
    const r = evaluateDiscount(percent(10), [line({ listing: "A", unitPriceCents: 33_333 }), line({ listing: "B", unitPriceCents: 33_333, quantity: 2 })], NOW);
    expect(r.valid && r.allocations.reduce((s, a) => s + a.discountCents, 0)).toBe(r.valid && r.discountAmountCents);
  });

  it("TASUTA TARNE: kehtib, toodete summat ei muuda", () => {
    const r = evaluateDiscount(rule({ type: "FREE_SHIPPING", value: 0 }), [line()], NOW);
    expect(r).toMatchObject({ valid: true, freeShipping: true, discountAmountCents: 0, totalCents: 50_000 });
  });
});

describe("DiscountEngine: kehtivus", () => {
  const dated = rule({ startsAt: new Date("2026-10-15T00:00:00+03:00"), expiresAt: new Date("2026-10-31T23:59:00+02:00") });

  it("enne algust → kehtetu; ajal → kehtib; pärast lõppu → aegunud", () => {
    expect(evaluateDiscount(dated, [line()], new Date("2026-10-14T20:00:00Z"))).toMatchObject({ valid: false, message: "Sooduskood ei ole veel aktiivne." });
    expect(evaluateDiscount(dated, [line()], NOW).valid).toBe(true);
    expect(evaluateDiscount(dated, [line()], new Date("2026-11-01T00:00:00Z"))).toMatchObject({ valid: false, message: "Sooduskood on aegunud." });
  });

  it("tegelik olek: ajastatud / aktiivne / aegunud / admini olek ülimuslik", () => {
    expect(effectiveDiscountStatus(dated, new Date("2026-10-01T00:00:00Z"))).toBe("SCHEDULED");
    expect(effectiveDiscountStatus(dated, NOW)).toBe("ACTIVE");
    expect(effectiveDiscountStatus(dated, new Date("2026-12-01T00:00:00Z"))).toBe("EXPIRED");
    expect(effectiveDiscountStatus({ ...dated, status: "DISABLED" }, NOW)).toBe("DISABLED");
    expect(effectiveDiscountStatus({ ...dated, status: "ARCHIVED" }, new Date("2026-12-01T00:00:00Z"))).toBe("ARCHIVED");
  });

  it("VÄLJA LÜLITATUD, ARHIVEERITUD, MUSTAND → kehtetu", () => {
    expect(evaluateDiscount(rule({ status: "DISABLED" }), [line()], NOW)).toMatchObject({ valid: false, message: "See sooduskood ei ole hetkel aktiivne." });
    // Arhiveeritud ja mustand ei reeda, et kood on olemas
    expect(evaluateDiscount(rule({ status: "ARCHIVED" }), [line()], NOW)).toMatchObject({ valid: false, message: "Sooduskoodi ei leitud." });
    expect(evaluateDiscount(rule({ status: "DRAFT" }), [line()], NOW)).toMatchObject({ valid: false, message: "Sooduskoodi ei leitud." });
    expect(evaluateDiscount(null, [line()], NOW)).toMatchObject({ valid: false, message: "Sooduskoodi ei leitud." });
  });

  it("KASUTUSPIIRANG: täis → kehtetu; kontrollimine ise kasutust ei muuda", () => {
    const limited = rule({ usageLimit: 100, usageCount: 99 });
    expect(evaluateDiscount(limited, [line()], NOW).valid).toBe(true);
    expect(limited.usageCount).toBe(99);
    expect(evaluateDiscount(rule({ usageLimit: 100, usageCount: 100 }), [line()], NOW)).toMatchObject({ valid: false, reason: "USAGE_LIMIT_REACHED" });
  });

  it("tühi ostukorv", () => {
    expect(evaluateDiscount(rule(), [], NOW)).toMatchObject({ valid: false, reason: "EMPTY_CART" });
  });
});

describe("DiscountEngine: tooted", () => {
  const cart = [line({ listing: "LEN-1", productModel: "lenovo-thinkpad-t14-gen-3", manufacturer: "lenovo" }), line({ listing: "DELL-1" })];

  it("TOOTJA: DELL10 Dell + Lenovo ostukorvis → 10% ainult Delli 500 €-lt = 50 €", () => {
    const r = evaluateDiscount(percent(10, { code: "DELL10", scope: "SELECTED_MANUFACTURERS", manufacturers: ["dell"] }), cart, NOW);
    expect(r).toMatchObject({ valid: true, eligibleSubtotalCents: 50_000, discountAmountCents: 5_000, subtotalCents: 100_000, totalCents: 95_000 });
    expect(r.valid && r.allocations.map((a) => [a.listing, a.discountCents])).toEqual([
      ["LEN-1", 0],
      ["DELL-1", 5_000],
    ]);
  });

  it("MUDEL ja KONFIGURATSIOON", () => {
    expect(evaluateDiscount(percent(10, { scope: "SELECTED_PRODUCT_MODELS", productModels: ["lenovo-thinkpad-t14-gen-3"] }), cart, NOW)).toMatchObject({ eligibleSubtotalCents: 50_000 });
    expect(evaluateDiscount(percent(10, { scope: "SELECTED_LISTINGS", listings: ["DELL-1"] }), cart, NOW)).toMatchObject({ eligibleSubtotalCents: 50_000 });
  });

  it("ei kehti ühelegi tootele → selge teade", () => {
    expect(evaluateDiscount(percent(10, { scope: "SELECTED_MANUFACTURERS", manufacturers: ["hp"] }), cart, NOW)).toMatchObject({ valid: false, message: "Sooduskood ei kehti ühelegi ostukorvis olevale tootele." });
  });

  it("VÄLISTUS: välistatud konfiguratsioon ega mudel soodustust ei saa (ka „kõik tooted“ koodiga)", () => {
    const r = evaluateDiscount(percent(10, { excludedListings: ["DELL-1"] }), cart, NOW);
    expect(r).toMatchObject({ eligibleSubtotalCents: 50_000, discountAmountCents: 5_000 });
    expect(r.valid && r.allocations.find((a) => a.listing === "DELL-1")?.discountCents).toBe(0);
    const byModel = evaluateDiscount(percent(10, { scope: "SELECTED_MANUFACTURERS", manufacturers: ["dell", "lenovo"], excludedProductModels: ["lenovo-thinkpad-t14-gen-3"] }), cart, NOW);
    expect(byModel).toMatchObject({ eligibleSubtotalCents: 50_000 });
  });

  it("fikseeritud summa piiratakse sobivate toodete summaga", () => {
    const r = evaluateDiscount(rule({ value: 80_000, scope: "SELECTED_MANUFACTURERS", manufacturers: ["dell"] }), cart, NOW);
    expect(r).toMatchObject({ discountAmountCents: 50_000, totalCents: 50_000 });
  });
});

describe("marginaalikaitse", () => {
  it("hinnastamismootori madalaim lubatud hind vastab miinimumkasumile", () => {
    const input = { costCents: 30_000, vatScheme: "MARGIN" as const };
    const floor = minimumAllowedPrice(pricingConfig, input)!;
    const sale = calculatePrice(pricingConfig, input).saleCents;
    expect(floor).toBeGreaterThan(input.costCents);
    expect(floor).toBeLessThanOrEqual(sale);
    expect(minimumAllowedPrice(pricingConfig, { costCents: 30_000, vatScheme: "UNKNOWN" })).toBeNull();
  });

  it("soodustus ei vii hinda alla lubatud miinimumi; vähendamine raporteeritakse", () => {
    const guarded = percent(30, { respectMinimumMargin: true });
    const r = evaluateDiscount(guarded, [line({ unitPriceCents: 50_000, minimumUnitPriceCents: 45_000 }), line({ listing: "SP-2", unitPriceCents: 50_000, minimumUnitPriceCents: 30_000 })], NOW);
    expect(r.valid && r.allocations.map((a) => [a.discountCents, a.marginLimited])).toEqual([
      [5_000, true],
      [15_000, false],
    ]);
    expect(r.valid && r.marginLimitedCount).toBe(1);
  });

  it("kui soodustust ei saa üldse anda → selge teade; kontrollimata read märgitakse", () => {
    expect(evaluateDiscount(percent(10, { respectMinimumMargin: true }), [line({ minimumUnitPriceCents: 50_000 })], NOW)).toMatchObject({ valid: false, reason: "MARGIN_PROTECTED" });
    const unchecked = evaluateDiscount(percent(10, { respectMinimumMargin: true }), [line({ minimumUnitPriceCents: null })], NOW);
    expect(unchecked.valid && unchecked.marginUncheckedCount).toBe(1);
    // Kaitse väljas → piirangut pole
    expect(evaluateDiscount(percent(10, { respectMinimumMargin: false }), [line({ minimumUnitPriceCents: 50_000 })], NOW)).toMatchObject({ valid: true, discountAmountCents: 5_000 });
  });
});

describe("snapshot ja vorming", () => {
  it("tellimuse snapshot säilitab tolle hetke väärtused", () => {
    const r = rule();
    const result = evaluateDiscount(r, [line()], NOW);
    if (!result.valid) throw new Error("peaks kehtima");
    const snapshot = buildDiscountSnapshot(r, result);
    expect(snapshot).toMatchObject({ code: "KOOL75", type: "FIXED_AMOUNT", value: 7500, discountAmountApplied: 7500, lines: [{ listing: "SP-1", discountCents: 7500 }] });
    r.value = 1; // hilisem muudatus koodis ei muuda snapshot'i
    expect(snapshot.value).toBe(7500);
  });

  it("soodustuse kuvamine", () => {
    expect(formatDiscountValue({ type: "PERCENTAGE", value: 1000, maximumDiscountCents: null })).toBe("10%");
    expect(plain(formatDiscountValue({ type: "PERCENTAGE", value: 1250, maximumDiscountCents: 10_000 }))).toBe("12,5% (max 100 €)");
    expect(plain(formatDiscountValue({ type: "FIXED_AMOUNT", value: 7500, maximumDiscountCents: null }))).toBe("75 €");
  });
});

describe("ajavöönd (Eesti aeg ↔ UTC)", () => {
  it("talveaeg (UTC+2) ja suveaeg (UTC+3)", () => {
    expect((tallinnLocalToUtc("2026-10-31T23:59") as Date).toISOString()).toBe("2026-10-31T21:59:00.000Z");
    expect((tallinnLocalToUtc("2026-10-15T00:00") as Date).toISOString()).toBe("2026-10-14T21:00:00.000Z");
    expect(toTallinnLocalInput(new Date("2026-10-31T21:59:00Z"))).toBe("2026-10-31T23:59");
    expect(formatTallinnDateTime(new Date("2026-07-01T09:30:00Z"))).toContain("12:30");
  });

  it("tühi → null, vigane → invalid", () => {
    expect(tallinnLocalToUtc("")).toBeNull();
    expect(tallinnLocalToUtc("31.10.2026")).toBe("invalid");
    expect(tallinnLocalToUtc("2026-02-30T10:00")).toBe("invalid");
  });
});

describe("admini vorm", () => {
  const base = { code: " Kool75 ", name: "Koolide eripakkumine", type: "FIXED_AMOUNT", value: "75", scope: "ALL_PRODUCTS", status: "DRAFT" };
  const form = (values: Record<string, string | string[]>) => {
    const fd = new FormData();
    for (const [k, v] of Object.entries(values)) for (const x of [v].flat()) fd.append(k, x);
    return parseDiscountForm(discountFormToObject(fd));
  };

  it("kehtiv vorm → normaliseeritud kood, sendid, UTC kuupäevad", () => {
    const r = form({ ...base, minimumSubtotal: "700", startsAt: "2026-10-01T00:00", expiresAt: "2026-10-31T23:59", usageLimit: "500" });
    expect(r.success && r.data).toMatchObject({ code: "Kool75", normalizedCode: "KOOL75", value: 7500, minimumSubtotalCents: 70_000, usageLimit: 500 });
    expect(r.success && r.data.expiresAt?.toISOString()).toBe("2026-10-31T21:59:00.000Z");
  });

  it("vead: protsent > 100, lõpp enne algust, tühi valik, vigane kood", () => {
    const r = form({ ...base, code: "a b", type: "PERCENTAGE", value: "150", startsAt: "2026-10-31T00:00", expiresAt: "2026-10-01T00:00", scope: "SELECTED_MANUFACTURERS" });
    expect(r.success).toBe(false);
    if (!r.success) expect(Object.keys(r.fieldErrors).sort()).toEqual(["code", "expiresAt", "scope", "value"]);
  });

  it("valitakse ainult aktiivse kehtivusala valikud; võltsitud tootja lükatakse tagasi", () => {
    const r = form({ ...base, scope: "SELECTED_MANUFACTURERS", manufacturers: ["dell"], productModelIds: ["00000000-0000-4000-8000-000000000000"] });
    expect(r.success && [r.data.manufacturers, r.data.productModelIds]).toEqual([["dell"], []]);
    expect(form({ ...base, scope: "SELECTED_MANUFACTURERS", manufacturers: ["apple"] }).success).toBe(false);
  });
});

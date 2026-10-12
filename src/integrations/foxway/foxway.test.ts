import { describe, expect, it } from "vitest";
import { appleChargerProfile, chargerDecision, parseBoxed } from "@/domain/catalog/charger";
import { pricingConfig } from "@/config/pricing";
import { percentOf } from "@/domain/money/money";
import { cpuFilterFamily, cpuFilterGeneration } from "@/domain/catalog/cpu-filter";
import { keyboardFilterLabel, keyboardFilterValue, keyboardLabel, normalizeKeyboard } from "@/domain/catalog/keyboard";
import { isMobileWorkstation, powerClass } from "@/domain/catalog/power-class";
import { GRADES, GRADE_CODES, gradeDisplay, parseSupplierGrade } from "@/domain/grade/grades";
import { parseKeyboardLayout } from "@/integrations/supplier/spec-parsers";
import { readFoxwayConfig, isFoxwayConfigured } from "./foxway-config";
import { assessCondition, classifyFault } from "./foxway-faults";
import { MAC_DIMS, foxwayFeeds, foxwayLine } from "./foxway-fixtures";
import { matchAppleModel, parseAppleName, parseFoxwayProductName } from "./foxway-names";
import { foxwayVatScheme, mapFoxwayAppearance, normalizeFoxwayCpu, normalizeFoxwayGpu, normalizeFoxwayLine, parseFoxwayDrive, parseFoxwayResolution, type FoxwayOffer } from "./foxway-normalizer";
import { foxwayEffectiveSupplierPriceCents, foxwaySalePrice } from "./foxway-pricing";
import { dimensionMap, parseFoxwayPricelist } from "./foxway-schema";
import { FoxwaySnapshotError, buildFoxwaySnapshot, decideFoxwayTrust } from "./foxway-snapshot";

/** Rida → pakkumine (test kukub, kui rida on vigane) */
function offer(input: Parameters<typeof foxwayLine>[0] = {}): FoxwayOffer {
  const result = normalizeFoxwayLine({ feed: "workingPc", catalog: "working", line: foxwayLine(input) });
  if (result.kind !== "OFFER") throw new Error(`INVALID: ${result.reasons.join("; ")}`);
  return result.offer;
}

describe("Foxway seadistus", () => {
  it("puuduv võti/URL → ei ole seadistatud; võti ei jõua veateatesse", () => {
    expect(isFoxwayConfigured({})).toBe(false);
    expect(isFoxwayConfigured({ FOXWAY_API_BASE_URL: "https://foxway.shop" })).toBe(false);
    expect(() => readFoxwayConfig({ FOXWAY_API_BASE_URL: "http://foxway.shop", FOXWAY_API_KEY: "0123456789abcdef0123" })).toThrow(/https/);
    try {
      readFoxwayConfig({ FOXWAY_API_BASE_URL: "nope", FOXWAY_API_KEY: "my-secret-key-0123456789" });
    } catch (error) {
      expect(String(error)).not.toContain("my-secret-key");
    }
    expect(readFoxwayConfig({ FOXWAY_API_BASE_URL: "https://foxway.shop/", FOXWAY_API_KEY: "0123456789abcdef0123" }).baseUrl).toBe("https://foxway.shop");
  });
});

describe("Foxway vastuse skeem", () => {
  it("vastus peab olema massiiv; vigane rida jäetakse vahele, ülejäänud jäävad", () => {
    expect(() => parseFoxwayPricelist({ error: "x" })).toThrow();
    const parsed = parseFoxwayPricelist([foxwayLine(), { SKU: "0120X", Quantity: "palju" }]);
    expect(parsed.lines).toHaveLength(1);
    expect(parsed.invalid).toEqual([expect.objectContaining({ index: 1, sku: "0120X" })]);
  });

  it("Dimension võtmed võivad puududa → null", () => {
    const map = dimensionMap(foxwayLine({ dims: { Keyboard: null, "PC Fault Descriptions": "Minor LCD fault" } }));
    expect(map.Keyboard).toBeUndefined();
    expect(map["PC Fault Descriptions"]).toBe("Minor LCD fault");
  });
});

describe("Rikete klassifikaator (mõlemad väljad, default closed)", () => {
  it("1. tavaline Working Dell → avaldatakse, märkusteta", () => {
    const o = offer();
    expect(o.hold).toBeNull();
    expect(o.condition.notes).toEqual([]);
    expect(o.grade).toBe("B");
  });

  it("2. Working* + Minor LCD fault → avaldatakse + kliendile NOTICE", () => {
    const o = offer({ dims: { Functionality: "Working*", "PC Fault Descriptions": "Minor LCD fault" } });
    expect(o.hold).toBeNull();
    expect(o.condition.severity).toBe("NOTICE");
    expect(o.condition.notes[0]).toMatchObject({ severity: "NOTICE", text: expect.stringContaining("Ekraanil võivad esineda nõrgad laigud") });
    expect(o.condition.notes[0].text).not.toMatch(/Working|katki/);
  });

  it("3. Working + Discoloration by Sticker → avaldatakse + INFO (rike kontrollitakse ka Working real)", () => {
    const o = offer({ dims: { Functionality: "Working", "PC Fault Descriptions": "Discoloration by Sticker" } });
    expect(o.hold).toBeNull();
    expect(o.condition.notes).toEqual([expect.objectContaining({ severity: "INFO", text: "Korpusel võib olla varasemast kleepsust jäänud kerge värvitooni erinevus." })]);
  });

  it("4. Working + Scratched on Purpose → avaldatakse + INFO (kleepsujälg, mitte 'tahtlikult kriimustatud')", () => {
    const o = offer({ dims: { "PC Fault Descriptions": "Scratched on Purpose" } });
    expect(o.hold).toBeNull();
    expect(o.condition.notes[0].text).toBe("Korpusel võib olla kleepsu eemaldamisest jäänud kerge jälg.");
    expect(o.condition.notes[0].text).not.toMatch(/tahtlik|kriimust/i);
  });

  it.each([
    ["5", "Severe LCD Damage"],
    ["6", "Cracked Display Glass"],
    ["7", "Damaged Housing"],
    ["8", "Faulty camera"],
    ["8b", "Faulty Camera"],
    ["9", "Faulty speaker"],
    ["10", "Faulty port (USB)"],
    ["10b", "Port Not Working (USB)"],
    ["–", "Black Screen/Dull Screen"],
    ["–", "Faulty Touchscreen"],
    ["–", "Broken Charging Socket"],
    ["–", "Loose Hinge"],
    ["–", "Speaker Issue"],
    ["–", "Cam Issue"],
    ["–", "Faulty port"],
  ])("%s. %s → BLOCKED (ei müüda)", (_, fault) => {
    const o = offer({ dims: { Functionality: "Working*", "PC Fault Descriptions": fault } });
    expect(o.hold).toBe("BLOCKED");
    expect(o.holdReasons.join(" ")).toContain(fault);
  });

  it("TrackPointi nupp (Missing/broken pointer nub) → REVIEW, mitte BLOCK; tundmatud kirjapildid samuti REVIEW", () => {
    const nub = offer({ dims: { Functionality: "Working*", "PC Fault Descriptions": "Missing/broken pointer nub" } });
    expect(nub.hold).toBe("REVIEW");
    expect(nub.condition.faults[0]).toMatchObject({ known: true, severity: "REVIEW" });
    expect(classifyFault("Missing pointer nub")).toMatchObject({ known: false, severity: "REVIEW" });
    expect(classifyFault("Broken TrackPoint cap")).toMatchObject({ known: false, severity: "REVIEW" });
    // REVIEW + lubatud → REVIEW; REVIEW + BLOCK → BLOCK (lisarikke väljal)
    expect(offer({ dims: { "PC Fault Descriptions": "Minor cosmetic fault", "PC Additional Fault": "Missing/broken pointer nub" } }).hold).toBe("REVIEW");
    expect(offer({ dims: { "PC Fault Descriptions": "Missing/broken pointer nub", "PC Additional Fault": "Loose Hinge" } }).hold).toBe("BLOCKED");
    expect(offer({ dims: { "PC Fault Descriptions": "Minor LCD Fault (Wearmarks)" } })).toMatchObject({ hold: null, condition: expect.objectContaining({ severity: "NOTICE" }) });
    for (const fault of ["Minor cosmetic fault (loose parts)", "Minor LCD Fault (Discoloration)", "SIM Tray Missing", "Minor functional issues"]) expect(classifyFault(fault).severity).toBe("REVIEW");
  });

  it("Minor functional issues → REVIEW (liiga ebamäärane auto-publish'iks)", () => {
    expect(offer({ dims: { Functionality: "Working*", "PC Fault Descriptions": "Minor functional issues" } }).hold).toBe("REVIEW");
  });

  it("11. tundmatu rike → REVIEW, mitte müüki; rikke-sõnaga tundmatu → BLOCKED", () => {
    const unknown = offer({ dims: { "PC Fault Descriptions": "Slight wobble when typing" } });
    expect(unknown.hold).toBe("REVIEW");
    expect(unknown.condition.faults[0]).toMatchObject({ known: false, severity: "REVIEW" });
    expect(classifyFault("Faulty keyboard backlight")).toMatchObject({ known: false, severity: "BLOCK" });
  });

  it("12. primaarne lubatud + lisarike blokeeritud → kogu SKU BLOCKED", () => {
    const o = offer({ dims: { Functionality: "Working*", "PC Fault Descriptions": "Minor cosmetic fault", "PC Additional Fault": "Faulty Camera" } });
    expect(o.hold).toBe("BLOCKED");
  });

  it("mõlemad lubatud → mõlemad märkused, duplikaat ühe korra", () => {
    const both = assessCondition({ functionality: "Working*", primaryFault: "Minor cosmetic fault", additionalFault: "Minor LCD Fault (Spots)" });
    expect(both.severity).toBe("NOTICE");
    expect(both.notes.map((n) => n.severity)).toEqual(["NOTICE", "INFO"]);
    const same = assessCondition({ functionality: "Working*", primaryFault: "Minor LCD fault", additionalFault: "Minor LCD Fault" });
    expect(same.notes).toHaveLength(1);
  });

  it("Working* ilma rikketa → REVIEW; katkine Functionality → BLOCKED", () => {
    expect(offer({ dims: { Functionality: "Working*" } }).hold).toBe("REVIEW");
    expect(offer({ dims: { Functionality: "Not working" } }).hold).toBe("BLOCKED");
    expect(offer({ dims: { Functionality: "Partly" } }).hold).toBe("REVIEW");
  });
});

describe("Seisukord (Appearance)", () => {
  it("14. Brand New → NEW ('Uus'); 15. C+ säilib eraldi klassina", () => {
    expect(mapFoxwayAppearance("Brand New").grade).toBe("NEW");
    expect(gradeDisplay("NEW")).toBe("Uus");
    expect(mapFoxwayAppearance("Grade C+").grade).toBe("C+");
    expect(mapFoxwayAppearance("Grade C").grade).toBe("C");
    expect(mapFoxwayAppearance("Grade A+").grade).toBe("A+");
    expect(parseSupplierGrade("Grade C+")).toBe("C+");
    expect(GRADE_CODES.indexOf("C+")).toBeLessThan(GRADE_CODES.indexOf("C"));
    expect(GRADES["C+"].param).toBe("c-plus");
  });

  it("katkised klassid (D, NP, Incomplete) → BLOCKED; tundmatu → REVIEW", () => {
    for (const raw of ["Grade D", "Grade E", "NP", "Incomplete"]) expect(mapFoxwayAppearance(raw).hold).toBe("BLOCKED");
    expect(mapFoxwayAppearance("Refurbished Gold").hold).toBe("REVIEW");
    expect(offer({ dims: { Appearance: "Grade D" } }).hold).toBe("BLOCKED");
  });
});

describe("Laoseis, hind, laadija", () => {
  it("16. täpne laoseis imporditakse (Quantity = stock)", () => {
    expect(offer({ quantity: 17 }).quantity).toBe(17);
    expect(offer({ quantity: 0 }).quantity).toBe(0);
  });

  it("26. hind = tarnija hind + KM (keskne määr) + 60 € + laadija", () => {
    const p = foxwaySalePrice(30_000, 3_500, { vatRateBps: 2_400 });
    expect(p).toMatchObject({ vatCents: 7_200, markupCents: 6_000, chargerCents: 3_500, salePriceCents: 46_700, costCents: 33_500 });
    expect(offer({ price: 300 }).price?.salePriceCents).toBe(30_000 + 7_200 + 6_000);
    // Kampaaniahind (kui API kunagi annab) kehtib ainult madalamana; praegu Price on autoriteetne
    expect(foxwayEffectiveSupplierPriceCents(30_000)).toBe(30_000);
    expect(foxwayEffectiveSupplierPriceCents(30_000, 27_000)).toBe(27_000);
  });

  it("IsVatMargin=false: 500 + KM 24% 120 + 60 + 0 = 680 €; IsVatMargin=true: 500 + 60 + 0 = 560 € (KM-i ostuhinnale ei lisata)", () => {
    expect(foxwaySalePrice(50_000, 0, { vatRateBps: 2_400 })).toMatchObject({ vatMargin: false, vatCents: 12_000, salePriceCents: 68_000 });
    expect(foxwaySalePrice(50_000, 0, { vatMargin: true, vatRateBps: 2_400 })).toMatchObject({ vatMargin: true, vatCents: 0, salePriceCents: 56_000, costCents: 50_000 });
    // Vaikimisi keskne KM määr (config/pricing.ts), mitte koodi sisse kirjutatud
    expect(foxwaySalePrice(50_000, 0).vatRateBps).toBe(pricingConfig.vatRateBps);
    const standard = offer({ price: 500, vatMargin: false, dims: { Boxed: "Charger included" } });
    const margin = offer({ price: 500, vatMargin: true, dims: { Boxed: "Unboxed" } });
    expect(standard.price?.salePriceCents).toBe(50_000 + percentOf(50_000, pricingConfig.vatRateBps) + 6_000);
    expect(margin.price).toMatchObject({ vatMargin: true, vatCents: 0, salePriceCents: 50_000 + 6_000 + 3_500 });
    // Margin EI blokeeri pakkumist — ainult teine hinnastus ja KM režiim
    expect(margin.hold).toBeNull();
    expect(foxwayVatScheme(true)).toBe("MARGIN");
    expect(foxwayVatScheme(false)).toBe("STANDARD");
    expect(foxwayVatScheme(null)).toBe("STANDARD");
  });

  it("19. Unboxed tavaline → +35 €; 20. Unboxed tööjaam → +90 €", () => {
    expect(offer({ dims: { Boxed: "Unboxed" } }).charger).toMatchObject({ profile: "STANDARD", surchargeCents: 3_500, customerLabel: "Laadija kaasas" });
    const ws = offer({ name: 'Dell Precision 7670 16"', dims: { Boxed: "Unboxed", "GPU laptops": "RTX A2000 8GB" } });
    expect(ws.charger).toMatchObject({ profile: "HIGH_POWER", surchargeCents: 9_000 });
    expect(offer({ name: 'HP ZBook Power G9 15.6"', dims: { Boxed: "Unboxed" } }).charger.surchargeCents).toBe(9_000);
    expect(offer({ name: 'Lenovo ThinkPad P15v Gen 2 15.6"', dims: { Boxed: "Unboxed" } }).charger.surchargeCents).toBe(9_000);
    // Mänguri RTX → suur laadija; MX-seeria → tavaline
    expect(offer({ name: 'MSI Katana GF66 15.6"', dims: { Boxed: "Unboxed", "GPU laptops": "GeForce RTX 3050 Ti 4GB" } }).charger.surchargeCents).toBe(9_000);
    expect(offer({ name: 'Lenovo IdeaPad 5 15ITL05 15.6"', dims: { Boxed: "Unboxed", "GPU laptops": "GeForce MX350 2GB" } }).charger.surchargeCents).toBe(3_500);
    expect(offer({ dims: { Boxed: "Unboxed" } }).price?.salePriceCents).toBe(30_000 + 7_200 + 6_000 + 3_500);
  });

  it.each([
    ['Apple Macbook Air (13" 2020, M1)', 3_500, "STANDARD"],
    ['Apple MacBook Air (15" 2023, M2)', 3_500, "STANDARD"],
    ['Apple MacBook (Retina, 12" 2017)', 3_500, "STANDARD"],
    ['Apple Macbook Pro (13" 2020, M1)', 3_500, "STANDARD"],
    ['Apple MacBook Pro (14" 2023, M3)', 6_000, "MID_POWER"],
    ['Apple MacBook Pro (Retina, 15" Mid 2015)', 9_000, "HIGH_POWER"],
    ['Apple MacBook Pro (16" 2023, M2)', 9_000, "HIGH_POWER"],
  ])("Apple Unboxed: %s → %i senti (%s)", (name, cents, profile) => {
    const o = offer({ name, itemGroupId: 54, dims: { ...MAC_DIMS, Boxed: "Unboxed" } });
    expect(o.charger).toMatchObject({ surchargeCents: cents, profile, customerLabel: "Laadija kaasas" });
    expect(o.charger.reason).toMatch(/Unboxed/);
  });

  it("Apple: Pro tundmatu suurus → 90 € (ei alahinnata); Original Box / Charger included → 0 €; suurem summa võidab", () => {
    expect(chargerDecision("Unboxed", { brand: "apple", series: "MacBook Pro", model: "2021" })).toMatchObject({ surchargeCents: 9_000, reason: expect.stringContaining("suurus teadmata") });
    expect(chargerDecision("Unboxed", { brand: "apple", series: "MacBook Pro", model: "2022", screenSizeIn: 14.2 })).toMatchObject({ surchargeCents: 6_000 });
    expect(chargerDecision("Original Box", { brand: "apple", series: "MacBook Pro", model: '16" 2023 M2' })).toMatchObject({ surchargeCents: 0, originalBox: true });
    expect(chargerDecision("Charger included", { brand: "apple", series: "MacBook Pro", model: '16" 2023 M2' })).toMatchObject({ surchargeCents: 0 });
    // Pro 13" jõudlusgraafikaga (hüpoteetiline) → üldine klassifikaator annab rohkem → 90 €
    expect(chargerDecision("Unboxed", { brand: "apple", series: "MacBook Pro", model: '13" 2020', gpu: "AMD Radeon Pro 5300M 4GB", gpuDedicated: true }).surchargeCents).toBe(9_000);
    expect(appleChargerProfile({ brand: "dell", series: "Latitude", model: "5420" })).toBeNull();
  });

  it("21. Charger included → +0 €; 22. Original Box → +0 € ja originaalkarp", () => {
    expect(offer({ dims: { Boxed: "Charger included" } }).charger).toMatchObject({ surchargeCents: 0, customerLabel: "Laadija kaasas" });
    expect(offer({ dims: { Boxed: "Original Box" } }).charger).toMatchObject({ surchargeCents: 0, originalBox: true, customerLabel: "Originaalkarp ja laadija kaasas" });
    expect(parseBoxed("Boxed in plastic")).toBe("UNKNOWN");
    expect(offer({ dims: { Boxed: "Boxed in plastic" } }).hold).toBe("REVIEW");
  });

  it("tööjaama tuvastus: seeria (mitte ainult CPU)", () => {
    expect(isMobileWorkstation({ brand: "dell", series: "Precision", model: "7670" })).toBe(true);
    expect(isMobileWorkstation({ brand: "fujitsu", series: "CELSIUS", model: "H780" })).toBe(true);
    expect(powerClass({ brand: "dell", series: "Latitude", model: "5420", gpu: null }).highPower).toBe(false);
    expect(chargerDecision("Unboxed", { brand: "dell", series: "Latitude", model: "5420" }).reason).toMatch(/Tavaline/);
  });

  it("27. mitte-EUR → REVIEW ja automaatset hinda pole", () => {
    const o = offer({ currency: "SEK" });
    expect(o.hold).toBe("REVIEW");
    expect(o.price).toBeNull();
    expect(o.holdReasons.join(" ")).toContain("SEK");
  });
});

describe("Klaviatuur (kogu poe register)", () => {
  it("23. SCA/DEU/FRA/… säilivad; silt + toorkood", () => {
    expect(normalizeKeyboard("SCA")).toMatchObject({ code: "SCA", known: true });
    expect(keyboardLabel("SCA")).toBe("Skandinaavia (SCA)");
    expect(normalizeKeyboard("DEU").code).toBe("DE");
    expect(keyboardLabel("DE")).toBe("Saksa (DE)");
    expect(keyboardLabel("FRA")).toBe("Prantsuse (FRA)");
    expect(keyboardLabel("INT")).toBe("Rahvusvaheline (INT)");
    expect(keyboardLabel("US")).toBe("USA");
    expect(normalizeKeyboard("USA").code).toBe("US");
    expect(normalizeKeyboard("SWE/FIN").code).toBe("SWE");
    expect(normalizeKeyboard("ARABIC").code).toBe("ARA");
    expect(offer({ dims: { Keyboard: "FRA" } }).keyboard).toMatchObject({ code: "FRA", raw: "FRA" });
  });

  it("tundmatu kood → toorkujul (valesti ei tõlgita); puuduv → null; Missing Keyboard → BLOCKED", () => {
    expect(normalizeKeyboard("XYZ")).toMatchObject({ code: "XYZ", known: false });
    expect(keyboardLabel("XYZ")).toBe("XYZ");
    expect(keyboardFilterLabel("xyz")).toBe("XYZ");
    expect(normalizeKeyboard(null).code).toBeNull();
    expect(offer({ dims: { Keyboard: null } }).keyboard.code).toBeNull();
    const missing = offer({ dims: { Keyboard: "Missing Keyboard" } });
    expect(missing.keyboard).toMatchObject({ code: null, missing: true });
    expect(missing.hold).toBe("BLOCKED");
  });

  it("vanad koodid ja teised tarnijad töötavad edasi (Laptopid SWE/NOR/EST/US/UK/DE)", () => {
    expect(parseKeyboardLayout("SE")).toBe("SWE");
    expect(parseKeyboardLayout("NO")).toBe("NOR");
    expect(parseKeyboardLayout("ENG-random")).toBeNull();
    expect(keyboardFilterValue("SWE")).toBe("swe");
    expect(keyboardFilterValue("SWE/FIN X")).toBe("swe-fin-x");
  });
});

describe("Nimed, mudelid, Apple", () => {
  it("ProductName → mudel (ekraan, Touch, kirjeldavad sulud välja; mudelikood jääb)", () => {
    expect(parseFoxwayProductName('Dell Latitude 5330 Touch 13.3"')).toMatchObject({ brand: "Dell", modelName: "Latitude 5330", screenSizeIn: 13.3, touch: true });
    expect(parseFoxwayProductName('Dell Latitude 3440 (2023) 14"')).toMatchObject({ modelName: "Latitude 3440", screenSizeIn: 14 });
    expect(parseFoxwayProductName('Lenovo ThinkPad E14 Gen 2 (AMD) 14"').modelName).toBe("ThinkPad E14 Gen 2");
    expect(parseFoxwayProductName('Lenovo Thinkpad X1 Carbon (10th Gen) 14"').modelName).toBe("ThinkPad X1 Carbon Gen 10");
    expect(parseFoxwayProductName('Asus Vivobook 15 (X1502) 15.6"').modelName).toBe("VivoBook 15 X1502");
    expect(parseFoxwayProductName('Asus Vivobook S 14 Flip TP3402 (12th Gen Intel) Touch 14"').modelName).toBe("VivoBook S 14 Flip TP3402");
    expect(parseFoxwayProductName('PC Specialist Recoil 17 R LC 17"').brand).toBe("PC Specialist");
  });

  it("sama mudeli slug kui Laptopid.ee/Tech (jagatud resolver) — duplikaatmudelit ei teki", () => {
    expect(offer({ name: 'Dell Latitude 5330 Touch 13.3"' }).model.slug).toBe("dell-latitude-5330");
    expect(offer({ name: 'Lenovo ThinkPad T14 Gen 3 (Intel) 14"' }).model.slug).toBe("lenovo-thinkpad-t14-gen-3");
    expect(offer({ name: 'HP Elitebook 840 G7 14"' }).model.slug).toBe("hp-elitebook-840-g7");
  });

  it("25. Apple M1/M2: nimi, CPU ja filtri perekond/põlvkond (Intel-parser ei lõhu)", () => {
    const keys = parseAppleName('Macbook Air (13" 2020, M1)')!;
    expect(keys).toMatchObject({ series: "MacBook Air", screenIn: 13, year: 2020, chip: "M1" });
    expect(parseAppleName('MacBook Pro (16" 2021, M1 Max)')).toMatchObject({ chip: "M1 Max", year: 2021 });
    expect(parseAppleName('MacBook Pro (13" 2020, 4 TBT3)')).toMatchObject({ chip: null, ports: "4 TBT3" });
    expect(parseAppleName('MacBook Pro (Retina, 15" Mid 2015)')).toMatchObject({ season: "Mid", year: 2015, screenIn: 15 });
    const mac = offer({ name: 'Apple Macbook Air (13" 2020, M1)', itemGroupId: 54, dims: MAC_DIMS });
    expect(mac.model).toMatchObject({ brand: "apple", series: "MacBook Air", slug: "apple-macbook-air-13-2020-m1" });
    expect(mac.cpu).toBe("Apple M1");
    // Keskne parser: Apple'i kiip → perekond + kiibi põlvkond (andmebaasis, mitte ainult filtris)
    expect(mac.cpuFamily).toBe("apple-m1");
    expect(mac.cpuGeneration).toBe("apple-1");
    expect(cpuFilterFamily({ model: "Apple M2 Pro 12-Core", family: null, generationKey: null })).toBe("apple-m2-pro");
    expect(cpuFilterGeneration({ model: "Apple M2 Pro 12-Core", family: null, generationKey: null })).toBe("apple-2");
    expect(mac.resolution).toBeNull();
    expect(mac.resolutionLabel).toBe("Retina");
    expect(mac.operatingSystem).toBe("macOS");
  });

  it("Apple vaste olemasoleva mudeliga: seeria + aasta + ekraan + kiip; mitmetähenduslik → uus mudel", () => {
    const candidates = [
      { id: "air-m2", family: "MacBook Air", model: "M2 2022", screenSizeIn: 13.6 },
      { id: "pro-2022", family: "MacBook Pro", model: "2022", screenSizeIn: 13.3 },
      { id: "pro-m2-pro", family: "MacBook Pro", model: "M2 Pro 2023", screenSizeIn: 16.2 },
    ];
    expect(matchAppleModel(parseAppleName('MacBook Air (13" 2022, M2)')!, candidates)).toBe("air-m2");
    expect(matchAppleModel(parseAppleName('MacBook Pro (16" 2023, M2)')!, candidates)).toBe("pro-m2-pro");
    expect(matchAppleModel(parseAppleName('MacBook Pro (13" 2022, M2)')!, candidates)).toBeNull(); // kiibita kandidaat → ei arva
    expect(matchAppleModel(parseAppleName('MacBook Pro (14" 2023, M2)')!, candidates)).toBeNull();
  });

  it("CPU/GPU/ekraan/ketas/OS normaliseerimine", () => {
    expect(normalizeFoxwayCpu("Core i5-1135G7")).toBe("Intel Core i5-1135G7");
    expect(normalizeFoxwayCpu("Ryzen 5 PRO 4650U")).toBe("AMD Ryzen 5 PRO 4650U");
    expect(normalizeFoxwayCpu("Snapdragon X Plus X1P-42-100")).toBe("Qualcomm Snapdragon X Plus X1P-42-100");
    expect(normalizeFoxwayGpu("Integrated")).toEqual({ gpu: null, dedicated: false, untested: false });
    expect(normalizeFoxwayGpu("GeForce RTX 4060 Max-Q 8GB")).toMatchObject({ gpu: "NVIDIA GeForce RTX 4060 Max-Q 8GB", dedicated: true });
    expect(normalizeFoxwayGpu("Iris Plus 655 1.5GB shared")).toMatchObject({ gpu: "Intel Iris Plus 655", dedicated: false });
    expect(normalizeFoxwayGpu("Not tested")).toMatchObject({ untested: true });
    expect(parseFoxwayResolution("WUXGA (1920x1200)")).toEqual({ resolution: "1920x1200", resolutionLabel: "WUXGA" });
    expect(parseFoxwayResolution("QHD (2256 x 1504)")).toEqual({ resolution: "2256x1504", resolutionLabel: "QHD" });
    expect(parseFoxwayDrive("256GB SSD + 1TB HDD")).toEqual({ storageGb: 256, storageType: "SSD", secondary: "1TB HDD" });
    expect(parseFoxwayDrive("1TB HDD")).toMatchObject({ storageGb: 1024, storageType: "HDD" });
    expect(offer({ dims: { Drive: "1TB HDD" } }).hold).toBe("REVIEW");
    expect(offer({ dims: { COA: "Win 11 Home Installed" } }).operatingSystem).toBe("Windows 11 Home");
    expect(offer({ dims: { COA: "Missing" } }).operatingSystem).toBeNull();
  });

  it("tahvel / detachable (Surface Pro, IdeaPad Duet) → BLOCKED", () => {
    expect(offer({ name: 'Microsoft Surface Pro 7 Plus Touch 12.3"' }).hold).toBe("BLOCKED");
    expect(offer({ name: 'Lenovo IdeaPad Duet 5 12IRU8 Touch 12.4"' }).hold).toBe("BLOCKED");
    expect(offer({ name: 'Microsoft Surface Laptop 5 Touch 13.5"' }).hold).toBeNull();
  });
});

describe("Kriitilised väljad", () => {
  it("SKU/ProductName/Quantity/Price puudub või vigane → INVALID (rida vahele, kehtiv SKU jääb nähtuks)", () => {
    const run = (input: Parameters<typeof foxwayLine>[0]) => normalizeFoxwayLine({ feed: "workingPc", catalog: "working", line: foxwayLine(input) });
    expect(run({ sku: null })).toMatchObject({ kind: "INVALID", sku: null });
    expect(run({ name: null })).toMatchObject({ kind: "INVALID", sku: "01209999900001" });
    expect(run({ quantity: -1 })).toMatchObject({ kind: "INVALID" });
    expect(run({ quantity: 1.5 })).toMatchObject({ kind: "INVALID" });
    expect(run({ price: 0 })).toMatchObject({ kind: "INVALID" });
    expect(run({ price: null })).toMatchObject({ kind: "INVALID" });
    expect(run({ name: 'Unknownbrand Book 14"' })).toMatchObject({ kind: "INVALID", reasons: [expect.stringContaining("Tundmatu tootja")] });
  });
});

describe("Snapshot: dedup SKU järgi ja usaldusväärsus", () => {
  it("13. sama SKU working + new → ÜKS pakkumine, kogus EI kahekordistu", () => {
    const line = foxwayLine({ sku: "05405924100100", name: 'Apple MacBook Pro (16" 2023, M2)', itemGroupId: 54, quantity: 2, price: 1960, dims: { ...MAC_DIMS, Appearance: "Brand New", Boxed: "Original Box", "CPU Laptops": "Apple M2 Pro 12-Core" } });
    const snapshot = buildFoxwaySnapshot(foxwayFeeds({ workingMac: [line], newMac: [line] }));
    expect(snapshot.offers).toHaveLength(1);
    expect(snapshot.offers[0]).toMatchObject({ quantity: 2, catalogs: ["working", "new"], canonicalCatalog: "new", grade: "NEW" });
    expect(snapshot.counts).toMatchObject({ uniqueSkus: 1, totalQuantity: 2, duplicateSkus: 1, duplicateConflicts: 0 });
  });

  it("sama SKU erinevate andmetega → konflikt logitakse, kanooniline kogus (mitte summa)", () => {
    const a = foxwayLine({ sku: "0120000000777", quantity: 2, price: 500 });
    const b = foxwayLine({ sku: "0120000000777", quantity: 5, price: 520 });
    const snapshot = buildFoxwaySnapshot(foxwayFeeds({ workingPc: [a], newPc: [b] }));
    expect(snapshot.offers[0].quantity).toBe(2);
    expect(snapshot.duplicates[0]).toMatchObject({ conflict: true, differences: expect.arrayContaining(["Quantity", "Price"]) });
  });

  it("tühi snapshot (kõik feed'id tühjad) → fataalne", () => {
    expect(() => buildFoxwaySnapshot(foxwayFeeds({}))).toThrow(FoxwaySnapshotError);
  });

  it("new · PC tühi on lubatud", () => {
    expect(buildFoxwaySnapshot(foxwayFeeds({ workingPc: [foxwayLine()] })).feeds.find((f) => f.key === "newPc")).toMatchObject({ rows: 0 });
  });

  it("18. suur kadu / palju vigaseid ridu → ei ole usaldusväärne (puuduvaid maha ei võeta)", () => {
    const seen = new Set(["a", "b"]);
    const previous = { availableSkus: Array.from({ length: 100 }, (_, i) => `sku-${i}`) };
    expect(decideFoxwayTrust({ seenSkus: seen, counts: { lines: 2, invalidRows: 0 } as never }, previous)).toMatchObject({ trusted: false, missing: 100 });
    expect(decideFoxwayTrust({ seenSkus: seen, counts: { lines: 2, invalidRows: 0 } as never }, previous, { allowLargeDrop: true }).trusted).toBe(true);
    expect(decideFoxwayTrust({ seenSkus: new Set(previous.availableSkus), counts: { lines: 100, invalidRows: 40 } as never }, previous).trusted).toBe(false);
    expect(decideFoxwayTrust({ seenSkus: new Set(previous.availableSkus.slice(5)), counts: { lines: 95, invalidRows: 1 } as never }, previous)).toMatchObject({ trusted: true, missing: 5 });
  });
});

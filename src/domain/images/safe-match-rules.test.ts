import { describe, expect, it } from "vitest";
import { buildModelIdentity, compareModelName, cpuEraMatch, titleHasIdentity } from "./model-identity";
import { codeMatchesIcecatName, consumerProductCode, titleHasProductCode } from "./product-code";
import { inferThinkPadGeneration } from "./thinkpad-generation";
import { usableGalleryCount, type GalleryCandidate } from "./model-gallery";

/**
 * Piltide vaste ohutud reeglid (pildisprint 2026-10-13): iga reegel on kitsas ja kohustuslikud tagasilükkamised jäävad.
 */

const id = (manufacturer: string, family: string, model: string, screenSizeIn: number | null = 14) => buildModelIdentity({ manufacturer, family, model, screenSizeIn });

describe("ohutud normaliseerimised", () => {
  it("MSI 'Gaming' eesliide on müra (ainult MSI)", () => {
    const vector = id("msi", "Vector", "Vector GP76", 17.3);
    expect(titleHasIdentity(vector, 'MSI MSI Gaming VECTOR GP76 12UH Intel® Core™ i7 i7-12700H Laptop 43.9 cm (17.3") Full HD')).toBe(true);
    expect(compareModelName(vector, "Gaming VECTOR GP76").verdict).toBe("EXACT");
  });

  it("Icecati kohatäide 'Configurable Material' ja 'Copilot+ PC' on müra", () => {
    expect(compareModelName(id("hp", "ZBook", "ZBook Power G7", 15.6), "ZBook Power G7 Mobile Workstation Configurable Material").verdict).toBe("EXACT");
    expect(compareModelName(id("lenovo", "Yoga", "Yoga 7 16ILL10 2-in-1", 16), "Yoga 7 2-in-1 16ILL10 Copilot+ PC").verdict).toBe("EXACT");
  });

  it("korduv sõna pealkirjas ('ZBook Power Power G8')", () => {
    expect(titleHasIdentity(id("hp", "ZBook", "ZBook Power G8", 15.6), 'HP HP ZBook Power Power G8 Intel® Core™ i7 i7-11850H Mobile workstation 39.6 cm (15.6")')).toBe(true);
  });

  it("sõnajärg: meie korpusesõna võib olla numbri järel (Latitude 14 Rugged 5420 ↔ Latitude 5420 Rugged)", () => {
    expect(titleHasIdentity(id("dell", "Latitude", "14 Rugged 5420"), 'DELL DELL Latitude 5420 Rugged Intel® Core™ i5 i5-8350U Laptop 35.6 cm (14")')).toBe(true);
    // Rugged pealkirjas, aga meie mudel pole Rugged → endiselt tagasi
    expect(titleHasIdentity(id("dell", "Latitude", "5420"), 'DELL Latitude 5420 Rugged Intel® Core™ i5 i5-8350U Laptop 35.6 cm (14")')).toBe(false);
  });

  it("Dell Latitude 'Carbon' / 'Magnesium' on materjal (sama korpus), ThinkPad X1 Carbon jääb eristavaks", () => {
    expect(compareModelName(id("dell", "Latitude", "7430 Carbon"), "Latitude 7430").verdict).toBe("EXACT");
    expect(compareModelName(id("dell", "Latitude", "7430 Magnesium"), "7430").verdict).toBe("FAMILY_MISSING");
    expect(titleHasIdentity(id("dell", "Latitude", "7430 Carbon"), 'DELL Latitude 7430 Intel® Core™ i5 i5-1245U Laptop 35.6 cm (14")')).toBe(true);
    expect(compareModelName(id("lenovo", "ThinkPad", "X1 Carbon Gen 9"), "ThinkPad X1 Yoga Gen 9").verdict).toBe("REJECT");
    expect(compareModelName(id("lenovo", "ThinkPad", "X1 Gen 9"), "ThinkPad X1 Carbon Gen 9").verdict).toBe("REJECT");
  });

  it("ASUS 'OLED' on müra ainult tootekoodiga mudelil", () => {
    expect(compareModelName(id("asus", "ZenBook", "Zenbook 14 UX3402"), "Zenbook 14 OLED UX3402").verdict).toBe("EXACT");
    expect(compareModelName(id("asus", "ZenBook", "Zenbook 14"), "Zenbook 14 OLED").verdict).toBe("REJECT");
  });

  it("Samsung 'Book4' = 'Book 4'; Pro ≠ Pro 360", () => {
    expect(compareModelName(id("samsung", "Galaxy Book", "Galaxy Book 4 Pro"), "Galaxy Book4 Pro").verdict).toBe("EXACT");
    expect(compareModelName(id("samsung", "Galaxy Book", "Galaxy Book 4 Pro"), "Galaxy Book4 Pro 360").verdict).toBe("REJECT");
  });

  it("Lenovo Gen 1 ↔ põlvkonnata Icecati nimi: FIRST_GEN, pealkirjas ei tohi olla teist põlvkonda, CPU ajastu peab klappima", () => {
    const e14 = id("lenovo", "ThinkPad", "E14 Gen 1");
    expect(compareModelName(e14, "ThinkPad E14").verdict).toBe("FIRST_GEN");
    expect(titleHasIdentity(e14, 'Lenovo ThinkPad E14 Intel® Core™ i5 i5-10210U Laptop 35.6 cm (14")', { firstGenUnnamed: true })).toBe(true);
    expect(titleHasIdentity(e14, 'Lenovo ThinkPad E14 Gen 2 Intel® Core™ i5 i5-1135G7 Laptop 35.6 cm (14")', { firstGenUnnamed: true })).toBe(false);
    expect(cpuEraMatch("Lenovo ThinkPad E14 Intel Core i5-10210U", ["Intel Core i5-10310U"])).toBe(true);
    expect(cpuEraMatch("Lenovo ThinkPad E14 Intel Core i5-1135G7", ["Intel Core i5-10310U"])).toBe(false);
    expect(cpuEraMatch("Lenovo ThinkPad E14", ["Intel Core i5-10310U"])).toBe(false); // CPU puudub → ei kinnita
    // Teised põlvkonnad jäävad: Gen 2 ↔ põlvkonnata nimi = REVIEW, mitte FIRST_GEN
    expect(compareModelName(id("lenovo", "ThinkPad", "E14 Gen 2"), "ThinkPad E14").verdict).toBe("REVIEW");
    expect(compareModelName(id("hp", "EliteBook", "840 G1"), "EliteBook 840").verdict).toBe("REVIEW");
  });
});

describe("kohustuslikud tagasilükkamised jäävad", () => {
  it("Latitude ≠ Precision, T14 ≠ T14s, G7 ≠ G8, Yoga/x360 ≠ tavaline, Gen 2 ≠ Gen 3", () => {
    expect(titleHasIdentity(id("dell", "Latitude", "5490"), 'DELL DELL Precision 5490 Intel Core Ultra 7 165H Mobile workstation 35.6 cm (14")')).toBe(false);
    expect(compareModelName(id("lenovo", "ThinkPad", "T14 Gen 3"), "ThinkPad T14s Gen 3").verdict).toBe("REJECT");
    expect(compareModelName(id("hp", "EliteBook", "840 G7"), "EliteBook 840 G8").verdict).toBe("REJECT");
    expect(compareModelName(id("hp", "EliteBook", "840 G7"), "EliteBook x360 840 G7").verdict).toBe("REJECT");
    expect(compareModelName(id("lenovo", "ThinkPad", "X13 Gen 2"), "ThinkPad X13 Yoga Gen 2").verdict).toBe("REJECT");
    expect(compareModelName(id("lenovo", "ThinkPad", "X13 Gen 2"), "ThinkPad X13 Gen 3").verdict).toBe("REJECT");
    expect(titleHasIdentity(id("lenovo", "IdeaPad", "IdeaPad 5 Pro 16", 16), 'Lenovo IdeaPad Yoga 5 Pro Intel® Core™ i5 i5-7200U Hybrid (2-in-1) 35.3 cm (13.9")')).toBe(false);
    expect(titleHasIdentity(id("samsung", "Galaxy Book", "Galaxy Book 5", 15.6), 'Samsung Notebook 5 AMD Ryzen™ 5 2500U Laptop 39.6 cm (15.6")')).toBe(false);
  });
});

describe("tarbijamudelite tootekood", () => {
  const code = (manufacturer: string, family: string, model: string) => consumerProductCode({ manufacturer, family, model });

  it("Acer / Samsung: täpne kood + SKU järelliide; täht koodi järel on teine mudel", () => {
    const sf = code("acer", "Swift", "Swift 3 SF314-52")!;
    const swift = id("acer", "Swift", "Swift 3 SF314-52");
    expect(sf).toMatchObject({ code: "sf314-52", mode: "SUFFIX" });
    expect(codeMatchesIcecatName(sf, swift, "SF314-52-567W")).toBe(true);
    expect(codeMatchesIcecatName(sf, swift, "SF314-52G-567W")).toBe(false);
    expect(codeMatchesIcecatName(sf, swift, "SF314-54-567W")).toBe(false);
    const np = code("samsung", "Galaxy Book", "Galaxy Book 2 Pro NP950XED")!;
    expect(codeMatchesIcecatName(np, id("samsung", "Galaxy Book", "Galaxy Book 2 Pro NP950XED"), "NP950XED-KF2US")).toBe(true);
  });

  it("ASUS: kood + platvormi tähed (X1504 → X1504ZA), mitte teine korpus", () => {
    const x = code("asus", "VivoBook", "VivoBook 15 X1504")!;
    const ident = id("asus", "VivoBook", "VivoBook 15 X1504", 15.6);
    expect(codeMatchesIcecatName(x, ident, "X1504ZA-NJ672")).toBe(true);
    expect(codeMatchesIcecatName(x, ident, "X1505ZA-NJ672")).toBe(false);
    expect(codeMatchesIcecatName(x, ident, "X1504ZAB12345")).toBe(false); // > 3 tähte + numbrid = teine kood
    expect(codeMatchesIcecatName(x, ident, "Vivobook Flip X1504ZA-1")).toBe(false); // teine korpus
    expect(titleHasProductCode(x, ident, 'ASUS Vivobook 15 X1504MA-BQ200 Intel Core 3 304 Laptop 39.6 cm (15.6")')).toBe(true);
    expect(titleHasProductCode(x, ident, 'ASUS Vivobook 15 X1504MA-BQ200 Intel Core 3 304 Laptop 35.6 cm (14")')).toBe(false); // ekraan
  });

  it("MSI: liini sõnad peavad klappima (C7V on mitmes liinis)", () => {
    const bravo = code("msi", "Bravo", "Bravo 15 C7V")!;
    const ident = id("msi", "Bravo", "Bravo 15 C7V", 15.6);
    expect(bravo.lineWords).toEqual(["bravo", "15"]);
    expect(codeMatchesIcecatName(bravo, ident, "Bravo 15 C7VFK-263BE")).toBe(true);
    expect(codeMatchesIcecatName(bravo, ident, "Alpha 15 C7VF-263BE")).toBe(false);
    expect(code("msi", "GF63", "GF63 Thin")).toBeNull();
  });

  it("HP tarbijamudel: platvorm (14-em0) + liin; Pavilion ≠ Laptop, 14-em1 ≠ 14-em0", () => {
    const hp = code("hp", "Laptop", "Laptop 14-em0422no")!;
    const ident = id("hp", "Laptop", "Laptop 14-em0422no");
    expect(hp).toMatchObject({ code: "14-em0", mode: "HP_PLATFORM" });
    expect(codeMatchesIcecatName(hp, ident, "Laptop 14-em0505na")).toBe(true);
    expect(codeMatchesIcecatName(hp, ident, "14-em1505na")).toBe(false);
    expect(codeMatchesIcecatName(hp, ident, "Pavilion 14-em0505na")).toBe(false);
    expect(titleHasProductCode(hp, ident, "HP Pavilion 14-em0505na AMD Ryzen 5 7520U")).toBe(false);
    const envy = code("hp", "Envy", "Envy x360 13-bf0812no")!;
    expect(titleHasProductCode(envy, id("hp", "Envy", "Envy x360 13-bf0812no", 13.3), 'HP HP ENVY x360 13-bf0002na Intel® Core™ i7 i7-1250U Hybrid (2-in-1) 33.8 cm (13.3")')).toBe(true);
    expect(titleHasProductCode(hp, ident, "HP Laptop 14-em0505na x360 Hybrid (2-in-1)")).toBe(false);
  });

  it("LG ja koodita mudelid: tootekoodi reeglit pole (14Z90 on mitme aasta mudel)", () => {
    expect(code("lg", "Gram", "Gram 14Z90")).toBeNull();
    expect(code("lenovo", "ThinkPad", "T14 Gen 3")).toBeNull();
  });
});

describe("ThinkPadi põlvkond protsessorite järgi (lisatõend)", () => {
  const infer = (model: string, cpus: string[]) => inferThinkPadGeneration({ manufacturer: "lenovo", family: "ThinkPad", model }, cpus).generation;

  it("üheselt tuletatav → põlvkond", () => {
    expect(infer("X13", ["AMD Ryzen 7 PRO 4750U"])).toBe(1);
    expect(infer("P15", ["Intel Core i5-10400H", "Intel Core i7-10850H"])).toBe(1);
    expect(infer("L15", ["AMD Ryzen 5 PRO 4650U"])).toBe(1);
    expect(infer("T14", ["Intel Core i5-1245U"])).toBe(3);
    expect(infer("L13 Yoga", ["Intel Core i5-10210U"])).toBe(1);
  });

  it("mitmetähenduslik → null (jääb REVIEW)", () => {
    expect(infer("X13", ["Intel Core i5-10310U", "Intel Core i5-1145G7"])).toBeNull(); // Gen 1 ja Gen 2
    expect(infer("L15", ["AMD Ryzen 5 PRO 5650U"])).toBeNull(); // L-seerias Gen 2 või Gen 3
    expect(infer("X13", [])).toBeNull();
    expect(infer("X13", ["Intel Core i5-8350U"])).toBeNull(); // enne 2020 liini
    expect(infer("E14", ["Intel Core i5-10210U"])).toBeNull(); // E-seeria ei järgi skeemi
    expect(infer("T480", ["Intel Core i5-8350U"])).toBeNull();
    expect(infer("X13 Gen 2", ["Intel Core i5-1145G7"])).toBeNull(); // põlvkond on nimes
  });
});

describe("rikastuse kandidaat: unikaalsed kasutatavad pildid (sama dedupe mis poes)", () => {
  const candidate = (url: string, hash: string | null, quality: "OK" | "BLANK" | null = "OK"): GalleryCandidate => ({
    view: { thumbnailUrl: url, mediumUrl: url, largeUrl: url, width: 1200, height: 900, alt: url, type: "MODEL_GENERIC" } as GalleryCandidate["view"],
    group: "LAPTOPID",
    order: [0],
    visualHash: hash,
    quality,
  });

  it("10 pildirida, mis on 2 foto koopiad → 2 unikaalset (ikka kandidaat, < 5)", () => {
    const rows = Array.from({ length: 10 }, (_, i) => candidate(`/l/${i}.jpg`, i % 2 ? "ffffffffffffffff" : "0000000000000000"));
    expect(usableGalleryCount(rows)).toBe(2);
  });

  it("BLANK ei loe; analüüsimata pildid loetakse URL-i järgi", () => {
    expect(usableGalleryCount([candidate("/a.jpg", null), candidate("/b.jpg", null), candidate("/c.jpg", "00ff00ff00ff00ff", "BLANK")])).toBe(2);
  });
});

import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { FACETS } from "@/domain/catalog/facets";
import { GRADE_CODES, gradeDisplay } from "@/domain/grade/grades";
import { LaptopidConfigError, isLaptopidConfigured, laptopidEndpoints, readLaptopidConfig } from "./laptopid-config";
import { laptopidProduct, laptopidV330 } from "./laptopid-fixtures";
import { mapLaptopidGrade, normalizeLaptopidProduct, resolveLaptopidModel } from "./laptopid-normalizer";
import { laptopidProductSchema } from "./laptopid-schema";

const normalize = (raw: Record<string, unknown>) => normalizeLaptopidProduct(laptopidProductSchema.parse(raw), []);

describe("seisukord: Laptopid New / Demo / Outlet → Uus", () => {
  it.each(["New", "Demo", "Outlet"])("%s → NEW (kliendile 'Uus'); algne väärtus säilib", (raw) => {
    const offer = normalize(laptopidProduct({ grade: raw }));
    expect(offer.listing.grade).toBe("NEW");
    expect(gradeDisplay(offer.listing.grade)).toBe("Uus");
    expect(offer.listing.details.sourceGrade).toBe(raw);
    expect(offer.raw.grade).toBe(raw);
  });

  it("tavalised klassid jäävad samaks ja algne väärtus on ka neil kirjas", () => {
    expect(mapLaptopidGrade("A+")).toBe("A+");
    expect(mapLaptopidGrade(" b ")).toBe("B");
    expect(mapLaptopidGrade("demo")).toBe("NEW");
    expect(mapLaptopidGrade("")).toBeNull();
    expect(normalize(laptopidProduct({ grade: "A" })).listing.details.sourceGrade).toBe("A");
  });

  it("seisukorra filtris on 'Uus' (esimesena), Demo/Outlet eraldi valikuna ei ole", () => {
    const grade = FACETS.grade;
    expect(GRADE_CODES[0]).toBe("NEW");
    expect(grade.isValidValue("uus")).toBe(true);
    expect(grade.optionLabel("uus")).toBe("Uus");
    expect(grade.isValidValue("demo")).toBe(false);
    expect(grade.isValidValue("outlet")).toBe(false);
    expect(grade.isValidValue("new")).toBe(false);
  });
});

describe("Lenovo V-seeria (V330-14IKB, Laptopid ID 1670)", () => {
  it("normaliseerub: Lenovo, seeria 'V Series', mudel 'V330-14IKB', pealkiri 'Lenovo V330-14IKB'", () => {
    const offer = normalize(laptopidV330());
    expect(offer.externalId).toBe("1670");
    expect(offer.model).toMatchObject({ brand: "lenovo", series: "V Series", model: "V330-14IKB", title: "Lenovo V330-14IKB", slug: "lenovo-v330-14ikb", taxonomyWarning: null });
    expect(offer.listing).toMatchObject({ cpu: "Intel Core i5-8250U", ramGb: 8, storageGb: 256, grade: "B", salePriceCents: 29_900 });
  });

  it("ei lähe ThinkPad / ThinkBook / IdeaPad / Yoga alla", () => {
    const { series } = resolveLaptopidModel("Lenovo", "V330-14IKB");
    expect(["ThinkPad", "ThinkPad P", "ThinkBook", "IdeaPad", "Yoga"]).not.toContain(series);
  });

  it("teised V-seeria nimed; mitte iga V-ga algav nimi pole V-seeria", () => {
    expect(resolveLaptopidModel("Lenovo", "V340-17IWL").series).toBe("V Series");
    expect(resolveLaptopidModel("Lenovo", "V15-IIL").series).toBe("V Series");
    expect(resolveLaptopidModel("Lenovo", "V14 G2 ITL").series).toBe("V Series");
    // Delli Vostro ei ole Lenovo V-seeria
    expect(resolveLaptopidModel("Dell", "Vostro 3520").series).not.toBe("V Series");
    // Lenovo "Vantage …" pole V-seeria muster → tagavara + hoiatus
    const other = resolveLaptopidModel("Lenovo", "Vantage 14");
    expect(other.series).not.toBe("V Series");
    expect(other.taxonomyWarning).toMatch(/Tundmatu seeria/);
  });

  it("tundmatu seeria: toode imporditakse konservatiivse uue seeriaga ja hoiatusega (mitte välja visatud)", () => {
    const model = resolveLaptopidModel("Lenovo", "IdeaPad 5 14ITL05");
    expect(model).toMatchObject({ series: "IdeaPad", model: "IdeaPad 5 14ITL05", title: "Lenovo IdeaPad 5 14ITL05" });
    expect(model.taxonomyWarning).toMatch(/Tundmatu seeria/);
    expect(() => resolveLaptopidModel("Acme", "X1")).toThrow(/Tundmatu tootja/);
  });
});

describe("Laptopid API seadistus (LAPTOPID_API_BASE_URL)", () => {
  it("baas-URL-ist products.php ja images.php (ka ilma lõpu-kaldkriipsuta)", () => {
    for (const base of ["https://laptopid.ee/api/sulearvutid/", "https://laptopid.ee/api/sulearvutid"]) {
      expect(laptopidEndpoints(base)).toEqual({
        productsUrl: "https://laptopid.ee/api/sulearvutid/products.php",
        imagesUrl: "https://laptopid.ee/api/sulearvutid/images.php",
      });
    }
  });

  it("puuduv või vigane seadistus → kontrollitud viga, hardcoded tagavara-URL-i pole", () => {
    expect(() => readLaptopidConfig({})).toThrow(LaptopidConfigError);
    expect(() => readLaptopidConfig({ LAPTOPID_API_KEY: "k" })).toThrow(/LAPTOPID_API_BASE_URL puudub/);
    expect(() => readLaptopidConfig({ LAPTOPID_API_BASE_URL: "https://laptopid.ee/api/sulearvutid/" })).toThrow(/LAPTOPID_API_KEY puudub/);
    expect(() => laptopidEndpoints("http://laptopid.ee/api/sulearvutid/")).toThrow(/https/);
    expect(() => laptopidEndpoints("ei-ole-url")).toThrow(LaptopidConfigError);
    expect(isLaptopidConfigured({})).toBe(false);
    expect(isLaptopidConfigured({ LAPTOPID_API_KEY: "k", LAPTOPID_API_BASE_URL: "https://laptopid.ee/api/sulearvutid/" })).toBe(true);
  });

  it("vana API URL muutujat ei kasutata kuskil (kood, testid, docs, .env.example); NEXT_PUBLIC_LAPTOPID_* puudub", () => {
    const oldName = ["LAPTOPID", "API", "URL"].join("_");
    const publicName = ["NEXT", "PUBLIC", "LAPTOPID"].join("_");
    const root = process.cwd();
    const files: string[] = [path.join(root, ".env.example"), path.join(root, "README.md"), path.join(root, "AGENTS.md"), path.join(root, "CHANGELOG.md")];
    const walk = (dir: string) => {
      for (const name of readdirSync(dir)) {
        const full = path.join(dir, name);
        if (statSync(full).isDirectory()) walk(full);
        else if (/\.(ts|tsx|md|json|mjs)$/.test(name)) files.push(full);
      }
    };
    for (const dir of ["src", "docs", "scripts"]) walk(path.join(root, dir));
    const offenders = files.filter((file) => {
      const text = readFileSync(file, "utf8");
      // Avalik muutuja = päris muutujanimi (eesliide + täht); dokumentatsiooni "…_*" märkus ei loe
      return new RegExp(`\\b${oldName}\\b`).test(text) || new RegExp(`${publicName}_[A-Z]`).test(text);
    });
    expect(offenders).toEqual([]);
  });
});

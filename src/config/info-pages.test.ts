import { describe, expect, it } from "vitest";
import { COMPANY, COMPANY_ADDRESS_LINE } from "./company";
import { getInfoPage, INFO_PAGES } from "./info-pages";

/** Kogu kliendile nähtav infolehtede sisu (tekstid + lingid) ühe stringina */
const allText = JSON.stringify(INFO_PAGES);
const pageText = (slug: string) => JSON.stringify(getInfoPage(slug));

describe("müüja andmed (Laptopid.ee live-lehe järgi, e-post ainult info@sylearvutid.ee)", () => {
  it("rekvisiidid ja kontaktid", () => {
    expect(COMPANY.legalName).toBe("Sülearvutid OÜ");
    expect(COMPANY.registryCode).toBe("11740579");
    expect(COMPANY_ADDRESS_LINE).toBe("Tartu mnt 83, 10115 Tallinn");
    expect(COMPANY.phone).toEqual({ label: "(+372) 6 835 543", href: "tel:+3726835543" });
    expect(COMPANY.mobile).toEqual({ label: "(+372) 56 665 943", href: "tel:+37256665943" });
    expect(COMPANY.email).toBe("info@sylearvutid.ee");
  });

  it("infolehtedel on ainus müüja e-post info@sylearvutid.ee; Laptopid.ee e-posti ega linke pole", () => {
    expect(allText).not.toMatch(/laptopid@|laptopid\.ee|laptopid\.es/i);
    const sellerEmails = [...allText.matchAll(/[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g)].map((m) => m[0]).filter((e) => !/ibm\.com|kernel\.ee|servisaict\.lt|fujitsu\.com/.test(e));
    expect(new Set(sellerEmails)).toEqual(new Set(["info@sylearvutid.ee"]));
  });

  it("bränd on Sülearvutid.ee; Laptopid.ee kaubamärgi väidet üle ei kantud", () => {
    expect(allText).not.toMatch(/Laptopid/i);
    expect(allText).not.toMatch(/kaubamärk/i);
    expect(pageText("muugitingimused")).toMatch(/Sülearvutid\.ee e-pood/);
  });
});

describe("infolehed", () => {
  it("Kontakt: nimi, registrikood, aadress, telefon, mobiil, e-post, lahtiolekuajad", () => {
    const text = pageText("kontakt");
    for (const value of ["Sülearvutid OÜ", "11740579", "Tartu mnt 83, 10115 Tallinn", "(+372) 6 835 543", "(+372) 56 665 943", "mailto:info@sylearvutid.ee", "E–R 10:00–18:00"]) {
      expect(text).toContain(value);
    }
  });

  it("E-poe tingimused: kõik peatükid (1–12) ja müügitingimused; prototüübi märkus maksete kohta", () => {
    const page = getInfoPage("muugitingimused")!;
    const headings = page.sections.map((s) => s.heading ?? "");
    for (const n of ["1. E-pood", "2. Üldsätted", "3. Tooted", "4. Hinnad", "5. Tarneaeg", "6. Lepingust taganemine", "7. Taganemisõigus", "8. Pretensioonide", "9. Isikuandmed", "10. Vastutus", "11. Erimeelsused", "12. Kasutamistingimused"]) {
      expect(headings.some((h) => h.startsWith(n))).toBe(true);
    }
    expect(headings).toContain("Sülearvutid OÜ müügitingimused");
    expect(page.prototypeNote).toMatch(/testtellimused/);
    expect(page.prototypeNote).toMatch(/lisanduvad poe avamisel/);
  });

  it("Garantii: aku 6 kuud, tarkvara/füüsilised vigastused välja arvatud, vedelikukahjustus, tootelehel täpne pikkus", () => {
    const text = pageText("garantii");
    expect(text).toMatch(/Akude garantii on 6 kuud/);
    expect(text).toMatch(/Garantii ei laiene tarkvarale/);
    expect(text).toMatch(/Vedelikukahjustuse defekteerimise tasu on 50 €/);
    expect(text).toMatch(/Täpsem garantii pikkus on märgitud tooteinfo lehel/);
    expect(text).toMatch(/Garantii teostamiseks on vajalik ostuarve/);
  });

  it("sisemised lingid viivad olemasolevatele Sülearvutid.ee lehtedele", () => {
    const slugs = new Set(INFO_PAGES.map((p) => `/info/${p.slug}`));
    const internal = INFO_PAGES.flatMap((p) => p.sections.flatMap((s) => s.links ?? [])).filter((l) => l.href.startsWith("/"));
    expect(internal.length).toBeGreaterThan(0);
    for (const link of internal) expect(slugs.has(link.href)).toBe(true);
  });

  it("juriidilised lehed on kinnitatud sisuga (arenduse märkust ei kuvata)", () => {
    for (const slug of ["kontakt", "garantii", "muugitingimused", "privaatsus", "tarne", "tagastamine"]) {
      expect(getInfoPage(slug)?.confirmed).toBe(true);
    }
  });
});

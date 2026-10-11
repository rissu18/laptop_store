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

  it("sisemised lingid (loend ja lõigus [tekst](/tee)) viivad olemasolevatele Sülearvutid.ee lehtedele", () => {
    const slugs = new Set(INFO_PAGES.map((p) => `/info/${p.slug}`));
    const listed = INFO_PAGES.flatMap((p) => p.sections.flatMap((s) => s.links ?? [])).filter((l) => l.href.startsWith("/")).map((l) => l.href);
    const inline = [...allText.matchAll(/\]\((\/[^)\s]*)\)/g)].map((m) => m[1]);
    expect(listed.length).toBeGreaterThan(0);
    expect(inline.length).toBeGreaterThan(0);
    for (const href of [...listed, ...inline]) expect(slugs.has(href)).toBe(true);
  });

  it("tarneaeg on kõikjal 1–10 tööpäeva (vastuolulist \"kaks tööpäeva\" pole)", () => {
    expect(allText).not.toMatch(/kaks tööpäeva|2 tööpäeva/);
    const mentions = [...allText.matchAll(/(\S+) tööpäeva(?![a-zõäöü])/g)].map((m) => m[1]);
    expect(mentions.length).toBeGreaterThanOrEqual(3);
    for (const value of mentions) expect(value).toBe("1–10");
  });

  it("isikuandmed: isikukoodi, sünniaasta ega soo kogumise väidet pole; loetelu vastab kassa väljadele", () => {
    expect(allText).not.toMatch(/isikukood|sünniaasta|sünniaeg|\bsugu\b|müügipakkumiste saatmisega nõustumine/i);
    const p95 = getInfoPage("muugitingimused")!.sections.flatMap((s) => s.paragraphs ?? []).find((p) => p.startsWith("9.5"))!;
    for (const field of ["eesnimi", "perekonnanimi", "elektronposti aadress", "telefoninumber", "postiindeks", "riik", "registrikood ja KMKR number", "märkused"]) {
      expect(p95).toContain(field);
    }
  });

  it("punkt 7.5 on parandatud", () => {
    expect(pageText("muugitingimused")).toContain("7.5 Lepingust taganemisel tuleb tarbijal ostetud asi viivitamatult tagastada.");
  });

  it("olematut \"lisa nr 1\" ei viidata; 8.2 ja remondi teostaja viitavad Garantii lehele", () => {
    expect(allText).not.toMatch(/\blisa(s|ks)?\s*(nr\.?\s*)?1\b/i);
    const paragraphs = getInfoPage("muugitingimused")!.sections.flatMap((s) => s.paragraphs ?? []);
    expect(paragraphs.find((p) => p.startsWith("8.2"))).toBe("8.2 Pretensioonide esitamise ja garantiiremondi info on toodud käesolevates tingimustes ning [Garantii lehel](/info/garantii).");
    expect(paragraphs.find((p) => p.startsWith("1.5"))).toContain("[Garantii lehel](/info/garantii) loetletud ettevõtteid");
  });

  it("12.2 kirjeldab kassa tegelikku märkeruutu Sülearvutid.ee nimega", () => {
    const p122 = getInfoPage("muugitingimused")!.sections.flatMap((s) => s.paragraphs ?? []).find((p) => p.startsWith("12.2"))!;
    expect(p122).toContain("Sülearvutid.ee kassas");
    expect(p122).toContain("„Olen tutvunud ja nõustun E-poe tingimustega.”");
  });

  it("privaatsus: ainult tehniliselt vajalikud küpsised/salvestused, analüütikat ja jälgimist pole", () => {
    const text = pageText("privaatsus");
    expect(text).toMatch(/ainult tehniliselt vajalikke küpsiseid/);
    expect(text).toMatch(/Analüütika-, reklaami- ega jälgimisküpsiseid ega kolmandate osapoolte jälgimis- või analüütikaskripte/);
  });

  it("Meist: mõlemad arendajad, väljamõeldud lisaväiteid pole", () => {
    const meist = getInfoPage("meist")!;
    expect(meist.confirmed).toBe(true);
    const text = JSON.stringify(meist);
    expect(text).toContain("Ristjan Rikk — Developer");
    expect(text).toContain("Virgo Rikk — Developer");
  });

  it("juriidilised lehed on kinnitatud sisuga (arenduse märkust ei kuvata)", () => {
    for (const slug of ["kontakt", "garantii", "muugitingimused", "privaatsus", "tarne", "tagastamine"]) {
      expect(getInfoPage(slug)?.confirmed).toBe(true);
    }
  });
});

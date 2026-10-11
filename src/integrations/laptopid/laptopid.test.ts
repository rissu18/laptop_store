import { describe, expect, it } from "vitest";
import { htmlToText } from "./html-text";
import { laptopidImages, laptopidProduct, laptopidSnapshot } from "./laptopid-fixtures";
import { laptopidImageUrls, normalizeCpu, normalizeLaptopidProduct, parsePriceCents } from "./laptopid-normalizer";
import { laptopidProductSchema } from "./laptopid-schema";
import { LaptopidSnapshotError, decideSnapshotTrust, parseLaptopidSnapshot } from "./laptopid-snapshot";

const normalize = (overrides: Record<string, unknown> = {}, images = laptopidImages(6678, [30530, 30531])) =>
  normalizeLaptopidProduct(laptopidProductSchema.parse(laptopidProduct(overrides)), images.map((i) => i as never));

describe("Laptopid API skeem", () => {
  it("päris vastuse kuju läbib valideerimise; uued tundmatud väljad ei murra", () => {
    expect(laptopidProductSchema.safeParse(laptopidProduct()).success).toBe(true);
    expect(laptopidProductSchema.safeParse(laptopidProduct({ uus_vali: "x" })).success).toBe(true);
  });

  it("vigane ID, puuduv tootja või müügihind → kirje lükatakse tagasi (stage validate)", () => {
    const { products, images } = laptopidSnapshot();
    const bad = [{ ...products[0], id: "abc" }, { ...products[1], manufacturer: "" }, { ...products[2], sale_price: undefined }, ...products.slice(3)];
    const many = [...bad, ...Array.from({ length: 60 }, (_, i) => laptopidProduct({ id: 9000 + i }))];
    const snapshot = parseLaptopidSnapshot(many, images);
    expect(snapshot.rejected.filter((r) => r.stage === "validate")).toHaveLength(3);
  });

  it("vastus pole massiiv / tühi / korduvad ID-d / liiga palju vigaseid → kogu snapshot on vigane", () => {
    expect(() => parseLaptopidSnapshot({ products: [] }, [])).toThrow(LaptopidSnapshotError);
    expect(() => parseLaptopidSnapshot([laptopidProduct()], { error: "x" })).toThrow(LaptopidSnapshotError);
    expect(() => parseLaptopidSnapshot([], [])).toThrow(/tühi/);
    expect(() => parseLaptopidSnapshot([laptopidProduct(), laptopidProduct()], [])).toThrow(/mitu korda/);
    expect(() => parseLaptopidSnapshot([laptopidProduct(), { id: 5, foo: 1 }], [])).toThrow(/skeemivigaseid/);
  });
});

describe("Laptopid normaliseerimine (toode 6678)", () => {
  it("identiteet = Laptopid ID; SKU LP-…; slug ei ole identiteet", () => {
    const offer = normalize();
    expect(offer.externalId).toBe("6678");
    expect(offer.sku).toBe("LP-6678");
    expect(normalize({ slug: "midagi-muud" }).externalId).toBe("6678");
  });

  it("riistvara: CPU, RAM, SSD, ekraan, GPU, OS, klaviatuur, seisukord, garantii", () => {
    const { listing, model } = normalize();
    expect(model).toMatchObject({ brand: "lenovo", series: "ThinkPad", model: "X1 Carbon Gen 10", slug: "lenovo-thinkpad-x1-carbon-gen-10" });
    expect(listing).toMatchObject({
      cpu: "Intel Core i5-1235U",
      cpuFamily: "intel-core-i5",
      cpuGeneration: "intel-12",
      ramGb: 16,
      ramType: "LPDDR5",
      storageGb: 256,
      screenSizeIn: 14,
      resolution: "1920x1200",
      resolutionLabel: "WUXGA",
      touchscreen: true,
      gpu: "Intel Iris Xe Graphics",
      gpuDedicated: false,
      operatingSystem: "Windows 11 Pro 64bit",
      keyboard: "SWE",
      grade: "A",
      warrantyMonths: 12,
      weightKg: 1.1,
    });
    expect(listing.details.cpuMaxMhz).toBe(4400);
  });

  it("sale_price = müügihind; new_price on ainult kontekst; ostuhinda (cost) normaliseeritud pakkumises pole", () => {
    const offer = normalize();
    expect(offer.listing.salePriceCents).toBe(74_900);
    expect(offer.listing.details.newPriceCents).toBe(279_900);
    expect(JSON.stringify(offer.listing)).not.toMatch(/cost|supplierPrice/i);
  });

  it("struktureeritud pordid ja omadused (0/1 → false/true); vabatekst ainult varuvariant", () => {
    const { listing } = normalize();
    expect(listing.features).toMatchObject({ thunderbolt: true, "usb-c": true, hdmi: true, lan: false, "sd-reader": false, smartcard: false, fingerprint: true, "ir-camera": true, lte: true, backlit: true, numpad: false, convertible: false, touch: true, "5g": null, light: true });
    expect(listing.details).toMatchObject({ usbA: 2, usbC: 2, thunderbolt: "4", displayPort: false, webcam: true, pointingStick: true, privacyScreen: false, refreshRateHz: 60 });
    expect(listing.details.portsText).toBe("2x USB 3.1, 2x USB-C / Thunderbolt 4, sõrmejäljelugeja, veebikaamera, Taustavalgustusega klaviatuur");
  });

  it("Wi-Fi/Bluetooth puuduvad API-s → neid ei mõelda välja", () => {
    const offer = normalize();
    expect(JSON.stringify(offer)).not.toMatch(/"wifi"|"bluetooth"/i);
  });

  it("pildid: järjekord sort_order järgi, kolm suurust laptopid.ee-st, '//' parandatud; võõras host ignoreeritakse", () => {
    const images = [...laptopidImages(6678, [30531, 30530]), { product_id: "6678", image_id: 1, sort_order: 0, image_url: "https://evil.example/x/original.png" }];
    const offer = normalize({}, images);
    expect(offer.images.map((i) => [i.sourceId, i.position])).toEqual([
      ["30530", 0],
      ["30531", 1],
    ]);
    expect(offer.images[0]).toMatchObject({
      thumbnailUrl: "https://laptopid.ee/images/product/6678/30530/small.png",
      mediumUrl: "https://laptopid.ee/images/product/6678/30530/medium.png",
      largeUrl: "https://laptopid.ee/images/product/6678/30530/original.png",
    });
    expect(laptopidImageUrls("http://laptopid.ee/images/product/1/2/original.png")).toBeNull();
    expect(laptopidImageUrls("https://laptopid.ee/admin/x.png")).toBeNull();
  });

  it("puuduvad pildid ei tee toodet katki", () => {
    expect(normalize({}, []).images).toEqual([]);
  });

  it("päriselt tundmatu seisukord, tühi mudel või vigane hind → tagasi lükatud, mitte välja mõeldud", () => {
    expect(() => normalize({ grade: "Refurb X" })).toThrow(/Tundmatu seisukord: Refurb X/);
    expect(() => normalize({ model: "   " })).toThrow();
    expect(() => normalize({ sale_price: "0.00" })).toThrow(/müügihind/);
  });

  it("defektid HTML-ist lihttekstiks; tühjad sildid → null", () => {
    expect(normalize({ defects: "<p>&Uuml;ks USB-C ei t&ouml;&ouml;ta</p>" }).listing.conditionNotes).toBe("Üks USB-C ei tööta");
    expect(normalize({ defects: "<h3>&nbsp;</h3>" }).listing.conditionNotes).toBeNull();
    expect(htmlToText("<p>a<br />b</p><script>alert(1)</script>")).toBe("a\nb");
  });

  it("abifunktsioonid: hind sentides ilma ujukomata, CPU nimi, tundmatu klaviatuur jääb algkujule", () => {
    expect(parsePriceCents("749.00")).toBe(74_900);
    expect(parsePriceCents("0.1")).toBe(10);
    expect(parsePriceCents("abc")).toBeNull();
    expect(normalizeCpu("Intel Ultra 7 155U 4800MHz")).toEqual({ name: "Intel Core Ultra 7 155U", maxMhz: 4800 });
    expect(normalizeCpu("AMD Ryzen 5 5600U 4.2GHz")).toEqual({ name: "AMD Ryzen 5 5600U", maxMhz: 4200 });
    const eng = normalize({ keyboard_layout: "ENG" }).listing;
    expect(eng.keyboard).toBeNull();
    expect(eng.details.keyboardRaw).toBe("ENG");
  });
});

describe("snapshot'i usaldusväärsus", () => {
  const snapshot = parseLaptopidSnapshot(laptopidSnapshot().products, laptopidSnapshot().images);

  it("sama mudeli 3 konfiguratsiooni jäävad 3 eraldi pakkumiseks; New/Demo/Outlet ja V330 ei jää enam vahele", () => {
    expect(snapshot.offers.filter((o) => o.model.slug === "lenovo-thinkpad-x1-carbon-gen-10").map((o) => o.externalId).sort()).toEqual(["6602", "6675", "6678"]);
    expect(snapshot.rejected).toEqual([]);
    expect(snapshot.offers.map((o) => o.externalId)).toEqual(expect.arrayContaining(["6224", "5643", "6629", "1670"]));
  });

  it("väike muutus (paar toodet müüdi) → usaldusväärne, puuduvad võetakse maha", () => {
    const decision = decideSnapshotTrust(snapshot, ["6678", "6675", "6602", "6493", "1111"]);
    expect(decision).toMatchObject({ trusted: true, missingIds: ["1111"] });
  });

  it("ebaloogiliselt suur kadu (poolik vastus) → ei ole usaldusväärne; admin saab teadlikult lubada", () => {
    const previous = Array.from({ length: 100 }, (_, i) => String(i + 1));
    expect(decideSnapshotTrust(snapshot, previous)).toMatchObject({ trusted: false });
    expect(decideSnapshotTrust(snapshot, previous, { allowLargeDrop: true })).toMatchObject({ trusted: true });
  });
});

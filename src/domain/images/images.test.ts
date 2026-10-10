import { describe, expect, it } from "vitest";
import { decideMatch, titleMatchesModel } from "./icecat-match";
import { buildAltText, buildImageFileName, imagesForDisplay, type ProductImageView } from "./product-image";

describe("decideMatch", () => {
  it("GTIN ja MPN kontrollitud pealkirjaga lähevad automaatselt live'i", () => {
    expect(decideMatch("GTIN", true)).toEqual({ status: "MATCHED", confidence: 1 });
    expect(decideMatch("MPN", true)).toEqual({ status: "MATCHED", confidence: 0.95 });
  });

  it("ainult mudelinime vaste vajab alati ülevaatust", () => {
    expect(decideMatch("MODEL_NAME", true).status).toBe("NEEDS_REVIEW");
  });

  it("kui pealkiri ei klapi, ei lähe isegi GTIN vaste live'i", () => {
    const result = decideMatch("GTIN", false);
    expect(result.status).toBe("NEEDS_REVIEW");
    expect(result.confidence).toBeLessThan(0.9);
  });

  it("admini kinnitus on alati kindel", () => {
    expect(decideMatch("MANUAL", false)).toEqual({ status: "MATCHED", confidence: 1 });
  });
});

describe("titleMatchesModel", () => {
  const t14 = "Lenovo ThinkPad T14 Gen 3 (Intel) Intel® Core™ i5 i5-1235U Laptop 35.6 cm (14\")";

  it("leiab mudeli Icecati pikast pealkirjast", () => {
    expect(titleMatchesModel(t14, "Lenovo", "ThinkPad T14 Gen 3")).toBe(true);
    expect(titleMatchesModel("DELL Latitude 5420 Intel® Core™ i5", "Dell", "Latitude 5420")).toBe(true);
  });

  it("ei aja segi sarnaseid mudeleid", () => {
    expect(titleMatchesModel("Lenovo ThinkPad T14s Gen 3", "Lenovo", "ThinkPad T14 Gen 3")).toBe(false);
    expect(titleMatchesModel("HP EliteBook 840 Aero G8", "HP", "EliteBook 840 G8")).toBe(false);
    expect(titleMatchesModel("Lenovo ThinkPad T14 Gen 2", "Lenovo", "ThinkPad T14 Gen 3")).toBe(false);
  });

  it("nõuab ka õiget brändi", () => {
    expect(titleMatchesModel("Acer Latitude 5420", "Dell", "Latitude 5420")).toBe(false);
  });
});

describe("pildi metaandmed", () => {
  it("failinimi on stabiilne ja SEO-sõbralik", () => {
    expect(buildImageFileName("lenovo-thinkpad-t14-gen-3", 0, "thumbnail")).toBe("lenovo-thinkpad-t14-gen-3-01-thumb.webp");
    expect(buildImageFileName("lenovo-thinkpad-t14-gen-3", 11, "large")).toBe("lenovo-thinkpad-t14-gen-3-12-large.webp");
    expect(buildImageFileName("dell-latitude-5420", 2, "medium", "57253760")).toBe("dell-latitude-5420-03-57253760-medium.webp");
  });

  it("alt-tekst tuleb mudeli nimest, ilma välja mõeldud vaateta", () => {
    expect(buildAltText("Lenovo ThinkPad T14 Gen 3", 0)).toBe("Lenovo ThinkPad T14 Gen 3 sülearvuti");
    expect(buildAltText("Lenovo ThinkPad T14 Gen 3", 2)).toBe("Lenovo ThinkPad T14 Gen 3 sülearvuti – pilt 3");
  });

  it("konkreetse seadme fotod on eelistatud mudeli piltidele", () => {
    const image = (type: ProductImageView["type"]): ProductImageView => ({ thumbnailUrl: type, mediumUrl: "", largeUrl: "", width: 1, height: 1, alt: "", type });
    expect(imagesForDisplay({ product: { images: [image("MODEL_GENERIC")] }, variant: { images: [] } })[0].type).toBe("MODEL_GENERIC");
    expect(imagesForDisplay({ product: { images: [image("MODEL_GENERIC")] }, variant: { images: [image("ACTUAL_UNIT")] } })[0].type).toBe("ACTUAL_UNIT");
  });
});

import { describe, expect, it } from "vitest";
import { decideMatch, titleMatchesModel } from "./icecat-match";
import { buildAltText, buildImageFileName, imagesForDisplay, visibleImages, type ProductImageView } from "./product-image";

describe("decideMatch", () => {
  it("GTIN, MPN ja teadaolev Icecat ID kontrollitud pealkirjaga lähevad automaatselt live'i", () => {
    expect(decideMatch("GTIN", true)).toEqual({ status: "MATCHED", confidence: 1, reason: null });
    expect(decideMatch("MPN", true)).toEqual({ status: "MATCHED", confidence: 0.95, reason: null });
    expect(decideMatch("ICECAT_ID", true)).toEqual({ status: "MATCHED", confidence: 0.9, reason: null });
  });

  it("ainult mudelinime vaste vajab alati ülevaatust", () => {
    expect(decideMatch("MODEL_NAME", true)).toMatchObject({ status: "NEEDS_REVIEW", reason: "LOW_CONFIDENCE" });
  });

  it("kui pealkiri ei klapi, ei lähe isegi GTIN vaste live'i", () => {
    const result = decideMatch("GTIN", false);
    expect(result).toMatchObject({ status: "NEEDS_REVIEW", reason: "TITLE_MISMATCH" });
    expect(result.confidence).toBeLessThan(0.9);
  });

  it("admini kinnitus on alati kindel", () => {
    expect(decideMatch("MANUAL", false)).toEqual({ status: "MATCHED", confidence: 1, reason: null });
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

  it("tunneb ära HP pealkirja, kuhu on lisatud ekraani suurus", () => {
    expect(titleMatchesModel("HP EliteBook 860 16 G10 Intel® Core™ i5", "HP", "EliteBook 860 G10")).toBe(true);
    expect(titleMatchesModel("HP EliteBook 840 14 G11 Intel Core Ultra 5", "HP", "EliteBook 840 G11")).toBe(true);
    // aga mitte teist põlvkonda
    expect(titleMatchesModel("HP EliteBook 860 16 G9", "HP", "EliteBook 860 G10")).toBe(false);
  });

  it("2-in-1 mudel: '2-in-1' võib Icecati pealkirjas olla mujal", () => {
    const title = "DELL Latitude 9420 Intel® Core™ i7 i7-1185G7 Hybrid (2-in-1) 35.6 cm (14\")";
    expect(titleMatchesModel(title, "Dell", "Latitude 9420 2-in-1")).toBe(true);
    // tavaline (mitte 2-in-1) 9420 ei sobi 2-in-1 mudelile
    expect(titleMatchesModel("DELL Latitude 9420 Laptop 35.6 cm", "Dell", "Latitude 9420 2-in-1")).toBe(false);
  });
});

describe("visibleImages", () => {
  it("jätab admini peidetud pildid välja", () => {
    const record = (sourceId: string, position: number, isHidden: boolean) => ({ sourceId, position, isHidden }) as never;
    expect(visibleImages([record("b", 1, false), record("a", 0, true), record("c", 2, false)]).map((r: { sourceId: string }) => r.sourceId)).toEqual(["b", "c"]);
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

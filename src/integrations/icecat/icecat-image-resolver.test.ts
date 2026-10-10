import { describe, expect, it } from "vitest";
import { galleryItem, icecatProduct } from "./icecat-fixtures";
import { resolveIcecatImages, selectSource } from "./icecat-image-resolver";

describe("resolveIcecatImages", () => {
  it("põhipilt on esimene ja seda ei dubleerita galeriist", () => {
    const images = resolveIcecatImages(icecatProduct());
    expect(images.map((i) => i.sourceId)).toEqual(["100", "101", "102"]);
    expect(images[0].isMain).toBe(true);
    expect(images.filter((i) => i.isMain)).toHaveLength(1);
    expect(images[0].updatedAt).toBe("2024-03-10 10:10:44");
  });

  it("järgib Icecati galerii järjekorda (No)", () => {
    const product = icecatProduct({ gallery: [galleryItem("1", 1), galleryItem("3", 3), galleryItem("2", 2)] });
    expect(resolveIcecatImages(product).map((i) => i.sourceId)).toEqual(["1", "2", "3"]);
  });

  it("eemaldab duplikaadid sama URL-iga ja privaatsed pildid", () => {
    const duplicate = galleryItem("201", 2, { Pic: "https://images.icecat.biz/img/gallery/100.jpg" });
    const privateImage = galleryItem("202", 3, { IsPrivate: "1" });
    const product = icecatProduct({ gallery: [galleryItem("100", 1), duplicate, privateImage, galleryItem("203", 4)] });
    expect(resolveIcecatImages(product).map((i) => i.sourceId)).toEqual(["100", "203"]);
  });

  it("jätab välja logoribad ja muud mitte-tootefotod", () => {
    const banner = galleryItem("300", 2, { PicWidth: "500", PicHeight: "49", Pic500x500Width: "500", Pic500x500Height: "49" });
    const product = icecatProduct({ gallery: [galleryItem("100", 1), banner] });
    expect(resolveIcecatImages(product).map((i) => i.sourceId)).toEqual(["100"]);
  });
});

describe("selectSource", () => {
  const [image] = resolveIcecatImages(icecatProduct());

  it("thumbnail: LowPic (200 px) on Retina jaoks liiga väike → Pic500x500", () => {
    expect(selectSource(image.candidates.thumbnail, "thumbnail")?.url).toContain("gallery_mediums");
  });

  it("medium: 700 px sihi jaoks võetakse HighPic ja vähendatakse", () => {
    expect(selectSource(image.candidates.medium, "medium")?.url).toContain("/gallery/");
  });

  it("large: HighPic", () => {
    expect(selectSource(image.candidates.large, "large")?.url).toContain("/gallery/");
  });

  it("kui ükski allikas pole piisavalt suur, võetakse suurim (ilma suurendamata)", () => {
    const small = [
      { url: "a", width: 200, height: 200 },
      { url: "b", width: 75, height: 75 },
    ];
    expect(selectSource(small, "large")?.url).toBe("a");
  });

  it("järgib prioriteeti, kui esimene on piisavalt suur", () => {
    const candidates = [
      { url: "low", width: 400, height: 400 },
      { url: "medium", width: 500, height: 500 },
    ];
    expect(selectSource(candidates, "thumbnail")?.url).toBe("low");
  });
});

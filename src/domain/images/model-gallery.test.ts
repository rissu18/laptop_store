import { describe, expect, it } from "vitest";
import { buildModelGallery, groupForListingImage, groupForModelImage, hexHashDistance, type GalleryCandidate, type GalleryGroup } from "./model-gallery";

const view = (url: string, type: "MODEL_GENERIC" | "ACTUAL_UNIT" | "PLACEHOLDER" = "MODEL_GENERIC") => ({
  thumbnailUrl: url, mediumUrl: url, largeUrl: url, width: 1000, height: 800, alt: url, type,
});
const c = (url: string, group: GalleryGroup, order: number[] = [0], extra: Partial<GalleryCandidate> = {}): GalleryCandidate => ({
  view: view(url), group, order, visualHash: null, quality: "OK", ...extra,
});
const urls = (list: { largeUrl: string }[]) => list.map((v) => v.largeUrl);

describe("mudeli koondgalerii", () => {
  it("allikate prioriteet: oma pildid → Laptopid.ee → tarnija → Icecat (sisendi järjekorrast sõltumata)", () => {
    const gallery = buildModelGallery([c("/icecat-1", "ICECAT"), c("https://sup/1", "SUPPLIER"), c("https://laptopid/1", "LAPTOPID"), c("/admin-1", "OWN")]);
    expect(urls(gallery)).toEqual(["/admin-1", "https://laptopid/1", "https://sup/1", "/icecat-1"]);
  });

  it("deterministlik: grupi sees järjekorravõtme järgi; sama sisend eri järjekorras → sama tulemus", () => {
    const input = [c("https://l/b-0", "LAPTOPID", [1, 1, 0]), c("https://l/a-1", "LAPTOPID", [1, 0, 1]), c("https://l/a-0", "LAPTOPID", [1, 0, 0]), c("/copy", "LAPTOPID", [0, 0, 0])];
    const expected = ["/copy", "https://l/a-0", "https://l/a-1", "https://l/b-0"];
    expect(urls(buildModelGallery(input))).toEqual(expected);
    expect(urls(buildModelGallery([...input].reverse()))).toEqual(expected);
  });

  it("dedupe: sama URL (päringuparameetriteta) ja visuaalselt sama pilt (räsi) — alles jääb kõrgema prioriteediga", () => {
    const gallery = buildModelGallery([
      c("https://laptopid.ee/images/product/1/2/original.png?v=1", "LAPTOPID", [1]),
      c("https://laptopid.ee/images/product/1/2/original.png", "LAPTOPID", [2]),
      c("/icecat-same-photo", "ICECAT", [0], { visualHash: "f0f0f0f0f0f0f0f1" }),
      c("https://laptopid.ee/other", "LAPTOPID", [3], { visualHash: "f0f0f0f0f0f0f0f0" }),
    ]);
    expect(urls(gallery)).toEqual(["https://laptopid.ee/images/product/1/2/original.png?v=1", "https://laptopid.ee/other"]);
    expect(hexHashDistance("f0f0f0f0f0f0f0f1", "f0f0f0f0f0f0f0f0")).toBe(1);
  });

  it("üle 10 pildi on lubatud (koondgalerii)", () => {
    const many = Array.from({ length: 14 }, (_, i) => c(`https://l/${i}`, "LAPTOPID", [i]));
    expect(buildModelGallery([...many, c("/icecat", "ICECAT")])).toHaveLength(15);
  });

  it("tühjad (BLANK) ja placeholderid eemaldatakse, kui sisukaid pilte on; katkised (BROKEN) alati", () => {
    const gallery = buildModelGallery([
      c("https://l/blank", "LAPTOPID", [0], { quality: "BLANK" }),
      c("https://l/ok", "LAPTOPID", [1]),
      c("/placeholder", "PLACEHOLDER"),
      c("https://l/broken", "LAPTOPID", [2], { quality: "BROKEN" }),
      c("/icecat-unanalyzed", "ICECAT", [0], { quality: null }),
    ]);
    expect(urls(gallery)).toEqual(["https://l/ok", "/icecat-unanalyzed"]);
  });

  it("kui sisukaid pilte pole, jääb varu viimaseks (tühi kaader enne placeholderit)", () => {
    expect(urls(buildModelGallery([c("/placeholder", "PLACEHOLDER"), c("https://l/blank", "LAPTOPID", [0], { quality: "BLANK" })]))).toEqual(["https://l/blank", "/placeholder"]);
    expect(buildModelGallery([c("https://l/broken", "LAPTOPID", [0], { quality: "BROKEN" })])).toEqual([]);
  });

  it("allika → grupi kaardistus", () => {
    expect(groupForModelImage("MANUAL", "MODEL_GENERIC")).toBe("OWN");
    expect(groupForModelImage("SUPPLIER", "ACTUAL_UNIT")).toBe("OWN");
    expect(groupForModelImage("LAPTOPID", "MODEL_GENERIC")).toBe("LAPTOPID");
    expect(groupForModelImage("ICECAT", "MODEL_GENERIC")).toBe("ICECAT");
    expect(groupForModelImage("ICECAT", "PLACEHOLDER")).toBe("PLACEHOLDER");
    expect(groupForListingImage("laptopid")).toBe("LAPTOPID");
    expect(groupForListingImage("foxway")).toBe("SUPPLIER");
  });
});

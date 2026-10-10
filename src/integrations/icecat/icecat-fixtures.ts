import { icecatProductSchema, type IcecatProduct } from "./icecat-types";

/**
 * Testides kasutatav Icecati vastus. Struktuur on võetud päris Open Icecati vastusest
 * (Dell Latitude 5420, 10.10.2026), URL-id on lühendatud.
 */
export function galleryItem(id: string, no: number, overrides: Record<string, unknown> = {}) {
  return {
    ID: id,
    LowPic: `https://images.icecat.biz/img/gallery_lows/${id}.jpg`,
    LowWidth: "200",
    LowHeight: "200",
    ThumbPic: `https://images.icecat.biz/img/gallery_thumbs/${id}.jpg`,
    Pic: `https://images.icecat.biz/img/gallery/${id}.jpg`,
    PicWidth: "4000",
    PicHeight: "4000",
    Pic500x500: `https://images.icecat.biz/img/gallery_mediums/${id}.jpg`,
    Pic500x500Width: "500",
    Pic500x500Height: "500",
    No: String(no),
    IsMain: no === 1 ? "Y" : "N",
    Updated: "2024-03-10 10:10:44",
    IsPrivate: "0",
    Type: "ProductImage",
    ...overrides,
  };
}

export function icecatProduct(overrides: { title?: string; icecatId?: string; gallery?: Record<string, unknown>[] } = {}): IcecatProduct {
  const gallery = overrides.gallery ?? [galleryItem("100", 1), galleryItem("101", 2), galleryItem("102", 3)];
  const main = gallery[0] as Record<string, string>;
  return icecatProductSchema.parse({
    GeneralInfo: {
      IcecatId: overrides.icecatId ?? "95037175",
      Title: overrides.title ?? "DELL Latitude 5420 Intel® Core™ i5 i5-1145G7 Laptop 35.6 cm (14\") Full HD",
      Brand: "DELL",
      ProductName: "Latitude 5420",
      BrandPartCode: "5420-0457",
      GTIN: [],
    },
    Image: main
      ? {
          HighPic: main.Pic,
          HighPicWidth: main.PicWidth,
          HighPicHeight: main.PicHeight,
          LowPic: main.LowPic,
          LowPicWidth: "200",
          LowPicHeight: "200",
          Pic500x500: main.Pic500x500,
          Pic500x500Width: "500",
          Pic500x500Height: "500",
          ThumbPic: main.ThumbPic,
        }
      : undefined,
    Gallery: gallery,
  });
}

import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { ImageValidationError, inspectImage, renderVariant, sniffImageType } from "./image-processor";

const jpeg = (width: number, height: number) =>
  sharp({ create: { width, height, channels: 3, background: "#336699" } }).jpeg().toBuffer();

describe("inspectImage", () => {
  it("tunneb JPEG-i sisu järgi ja loeb mõõdud", async () => {
    const result = await inspectImage(await jpeg(800, 600), "image/jpeg");
    expect(result).toMatchObject({ contentType: "image/jpeg", width: 800, height: 600 });
  });

  it("lükkab tagasi HTML-i, isegi kui server väidab, et see on pilt", async () => {
    const html = Buffer.from("<html><body>Access denied</body></html>");
    expect(sniffImageType(html)).toBeNull();
    await expect(inspectImage(html, "image/jpeg")).rejects.toThrow(ImageValidationError);
  });

  it("lükkab tagasi vale Content-Type'i", async () => {
    await expect(inspectImage(await jpeg(800, 600), "text/html")).rejects.toThrow(/Content-Type/);
  });

  it("lükkab tagasi liiga väikese pildi", async () => {
    await expect(inspectImage(await jpeg(500, 49), "image/jpeg")).rejects.toThrow(/liiga väike/);
  });
});

describe("renderVariant", () => {
  it("thumbnail: 300×300 ruut, sülearvuti tervikuna (contain, mitte crop)", async () => {
    const result = await renderVariant(await jpeg(2000, 1000), "thumbnail", false);
    expect([result.width, result.height]).toEqual([300, 300]);
    expect(result.contentType).toBe("image/webp");
  });

  it("medium: max 700 px, kuvasuhe säilib", async () => {
    const result = await renderVariant(await jpeg(2000, 1000), "medium", false);
    expect([result.width, result.height]).toEqual([700, 350]);
  });

  it("ei suurenda väikest pilti", async () => {
    const result = await renderVariant(await jpeg(500, 500), "large", false);
    expect([result.width, result.height]).toEqual([500, 500]);
  });

  it("large: 4000 px originaal vähendatakse 2000 px-ni", async () => {
    const result = await renderVariant(await jpeg(4000, 4000), "large", false);
    expect(result.width).toBe(2000);
  });
});

import { describe, expect, it } from "vitest";
import { createImageSizeProbe, readImageSize } from "./image-probe";

function pngHeader(width: number, height: number): Uint8Array {
  const bytes = new Uint8Array(33);
  bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52]);
  const view = new DataView(bytes.buffer);
  view.setUint32(16, width);
  view.setUint32(20, height);
  return bytes;
}

describe("pildi mõõdud päisest", () => {
  it("PNG IHDR", () => {
    expect(readImageSize(pngHeader(1105, 814))).toEqual({ width: 1105, height: 814 });
  });

  it("HTML (nt 404 leht) ei ole pilt", () => {
    expect(readImageSize(new TextEncoder().encode("<!DOCTYPE html><html>"))).toBeNull();
  });

  it("Range päring; 404 või mitte-pilt → null (toode jääb korda, pilt lisatakse järgmisel sync'il)", async () => {
    const requests: RequestInit[] = [];
    const ok = createImageSizeProbe((async (_url: string, init: RequestInit) => {
      requests.push(init);
      return new Response(pngHeader(800, 600) as BodyInit, { status: 206, headers: { "content-type": "image/png" } });
    }) as typeof fetch);
    expect(await ok("https://laptopid.ee/images/product/1/2/original.png")).toEqual({ width: 800, height: 600 });
    expect((requests[0].headers as Record<string, string>).Range).toMatch(/^bytes=0-/);

    const missing = createImageSizeProbe((async () => new Response("<html>404</html>", { status: 404, headers: { "content-type": "text/html" } })) as typeof fetch);
    expect(await missing("https://laptopid.ee/images/product/1/3/original.png")).toBeNull();
  });
});

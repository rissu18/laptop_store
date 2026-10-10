import { describe, expect, it } from "vitest";
import { IcecatClient } from "./icecat-client";
import { galleryItem } from "./icecat-fixtures";

function jsonResponse(status: number, body: unknown) {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

function client(handler: (url: string, init: RequestInit) => Response, extra: Partial<ConstructorParameters<typeof IcecatClient>[0]> = {}) {
  const calls: { url: string; init: RequestInit }[] = [];
  const instance = new IcecatClient({
    username: "testuser",
    apiToken: "SECRET-API",
    contentToken: "SECRET-CONTENT",
    sleep: async () => {},
    fetchImpl: (async (url: string, init: RequestInit) => {
      calls.push({ url, init });
      return handler(url, init);
    }) as typeof fetch,
    ...extra,
  });
  return { instance, calls };
}

const productBody = {
  msg: "OK",
  data: { GeneralInfo: { IcecatId: "1", Title: "DELL Latitude 5420", Brand: "DELL" }, Gallery: [galleryItem("1", 1)] },
};

describe("IcecatClient", () => {
  it("saadab tokenid ainult päistes, mitte URL-is", async () => {
    const { instance, calls } = client(() => jsonResponse(200, productBody));
    await instance.getProduct({ kind: "MPN", brand: "Dell", mpn: "5420-0457" });
    const { url, init } = calls[0];
    expect(url).not.toMatch(/SECRET/);
    expect(url).toContain("shopname=testuser");
    expect(url).toContain("ProductCode=5420-0457");
    expect((init.headers as Record<string, string>)["api-token"]).toBe("SECRET-API");
    expect((init.headers as Record<string, string>)["content-token"]).toBe("SECRET-CONTENT");
  });

  it("parsib toote ja teisendab numbrid", async () => {
    const { instance } = client(() => jsonResponse(200, productBody));
    const result = await instance.getProduct({ kind: "ICECAT_ID", icecatId: "1" });
    expect(result.status).toBe("FOUND");
    if (result.status === "FOUND") expect(result.product.Gallery[0].PicWidth).toBe(4000);
  });

  it("404 / not found → NOT_FOUND ilma kordamiseta", async () => {
    const { instance, calls } = client(() =>
      jsonResponse(404, { StatusCode: 15, Code: 404, Error: "Not Found", Message: "Products datasheet is not yet released" }),
    );
    expect((await instance.getProduct({ kind: "GTIN", gtin: "0884116437888" })).status).toBe("NOT_FOUND");
    expect(calls).toHaveLength(1);
  });

  it("5xx → kordab piiratud arv kordi ja tagastab ERROR", async () => {
    const { instance, calls } = client(() => jsonResponse(503, { Message: "unavailable" }), { maxRetries: 2 });
    expect((await instance.getProduct({ kind: "ICECAT_ID", icecatId: "1" })).status).toBe("ERROR");
    expect(calls).toHaveLength(3);
  });

  it("ajutise vea järel õnnestunud päring tagastab toote", async () => {
    let count = 0;
    const { instance } = client(() => (++count === 1 ? jsonResponse(502, {}) : jsonResponse(200, productBody)));
    expect((await instance.getProduct({ kind: "ICECAT_ID", icecatId: "1" })).status).toBe("FOUND");
  });

  it("ilma tokeniteta ei saadeta tühje päiseid", () => {
    const instance = new IcecatClient({ username: "u" });
    expect(instance.headers()).not.toHaveProperty("api-token");
    expect(instance.assetHeaders()).toEqual({});
  });
});

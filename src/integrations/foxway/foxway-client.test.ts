import { describe, expect, it, vi } from "vitest";
import { foxwayLine } from "./foxway-fixtures";
import { FOXWAY_FEEDS } from "./foxway-schema";

vi.mock("server-only", () => ({}));

const env = { FOXWAY_API_BASE_URL: "https://foxway.example", FOXWAY_API_KEY: "test-secret-key-0123456789" };
const feed = FOXWAY_FEEDS[0];
const ok = (body: string, status = 200) => ({ status, body, wireBytes: body.length, contentEncoding: "gzip" });

describe("Foxway API klient", () => {
  it("saadab X-ApiKey ja Accept-Encoding: gzip; õige URL (DimensionGroup 11, ItemGroup)", async () => {
    const { fetchFoxwayFeed } = await import("./foxway-client");
    const transport = vi.fn(async () => ok(JSON.stringify([foxwayLine()])));
    const result = await fetchFoxwayFeed(feed, { env, transport });
    expect(result.pricelist.lines).toHaveLength(1);
    const [url, headers] = transport.mock.calls[0] as unknown as [string, Record<string, string>];
    expect(url).toBe("https://foxway.example/api/v1/catalogs/working/pricelist?dimensionGroupId=11&itemGroupId=12");
    expect(headers).toMatchObject({ "X-ApiKey": env.FOXWAY_API_KEY, "Accept-Encoding": "gzip" });
  });

  it("HTTP 200 + tühi keha → EMPTY_BODY (mitte tühi nimekiri); '[]' → tühi nimekiri", async () => {
    const { fetchFoxwayFeed } = await import("./foxway-client");
    await expect(fetchFoxwayFeed(feed, { env, transport: async () => ok("") })).rejects.toMatchObject({ code: "EMPTY_BODY" });
    expect((await fetchFoxwayFeed(feed, { env, transport: async () => ok("[]") })).pricelist.lines).toEqual([]);
  });

  it("401 → AUTH, mitte-JSON → INVALID_JSON, objekt → SCHEMA; võti ei ole veateates", async () => {
    const { fetchFoxwayFeed } = await import("./foxway-client");
    const auth = fetchFoxwayFeed(feed, { env, transport: async () => ok("", 401) });
    await expect(auth).rejects.toMatchObject({ code: "AUTH" });
    await auth.catch((error) => expect(String(error.message)).not.toContain(env.FOXWAY_API_KEY));
    await expect(fetchFoxwayFeed(feed, { env, transport: async () => ok("<html>") })).rejects.toMatchObject({ code: "INVALID_JSON" });
    await expect(fetchFoxwayFeed(feed, { env, transport: async () => ok('{"Message":"x"}') })).rejects.toMatchObject({ code: "SCHEMA" });
  });

  it("võrguviga / 5xx → kuni 3 katset, siis NETWORK; seadistamata → NOT_CONFIGURED", async () => {
    const { fetchFoxwayFeed } = await import("./foxway-client");
    const flaky = vi.fn().mockRejectedValueOnce(new Error("socket hang up")).mockResolvedValueOnce(ok("", 503)).mockResolvedValueOnce(ok("[]"));
    const result = await fetchFoxwayFeed(feed, { env, transport: flaky, sleep: async () => {} });
    expect(result.attempts).toBe(3);
    await expect(fetchFoxwayFeed(feed, { env, transport: async () => { throw new Error("ETIMEDOUT"); }, sleep: async () => {} })).rejects.toMatchObject({ code: "NETWORK", message: expect.stringContaining("Working · PC Laptops") });
    await expect(fetchFoxwayFeed(feed, { env: {}, transport: async () => ok("[]") })).rejects.toMatchObject({ code: "NOT_CONFIGURED" });
  });
});

import { beforeEach, describe, expect, it, vi } from "vitest";

/** CSRF: muutvad päringud peavad tulema samalt saidilt (Origin === Host). */
const headerState = vi.hoisted(() => ({ values: {} as Record<string, string> }));
vi.mock("next/headers", () => ({
  headers: async () => new Headers(headerState.values),
  cookies: async () => ({ get: () => undefined }),
}));
vi.mock("next/server", () => ({ connection: async () => {} }));

describe("assertSameOrigin", () => {
  beforeEach(() => {
    headerState.values = {};
  });

  it("lubab sama saidi päringu", async () => {
    const { assertSameOrigin } = await import("./auth");
    headerState.values = { origin: "https://pood.example", host: "pood.example" };
    await expect(assertSameOrigin()).resolves.toBeUndefined();
    headerState.values = { origin: "https://pood.example", host: "internal:3000", "x-forwarded-host": "pood.example" };
    await expect(assertSameOrigin()).resolves.toBeUndefined();
  });

  it("keelab teise saidi, puuduva või vigase päritolu", async () => {
    const { assertSameOrigin, UnauthorizedError } = await import("./auth");
    headerState.values = { origin: "https://evil.example", host: "pood.example" };
    await expect(assertSameOrigin()).rejects.toBeInstanceOf(UnauthorizedError);
    headerState.values = { host: "pood.example" };
    await expect(assertSameOrigin()).rejects.toBeInstanceOf(UnauthorizedError);
    headerState.values = { origin: "null", host: "pood.example" };
    await expect(assertSameOrigin()).rejects.toBeInstanceOf(UnauthorizedError);
  });

  it("requireAdminAction ilma sessioonita viskab UnauthorizedError (mitte ei suuna)", async () => {
    const { requireAdminAction, UnauthorizedError } = await import("./auth");
    headerState.values = { origin: "https://pood.example", host: "pood.example" };
    await expect(requireAdminAction()).rejects.toBeInstanceOf(UnauthorizedError);
  });
});

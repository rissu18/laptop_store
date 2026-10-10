import { NextRequest } from "next/server";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { proxy } from "@/proxy";
import { createTestDatabase, hasTestDatabase, type TestDatabase } from "@/test/test-db";
import { adminUsers, loginAttempts } from "@/server/db/schema";
import { SESSION_COOKIE, safeAdminRedirect } from "./constants";
import { hashPassword, validatePasswordStrength, verifyPassword } from "./password";
import { MAX_FAILED_PER_EMAIL, isLoginBlocked, recordLoginAttempt } from "./rate-limit";
import { SESSION_TTL_MS, createSessionRecord, deleteSessionRecord, findSessionAdmin, hashToken } from "./session-store";

describe("paroolid", () => {
  it("räsi ja kontroll (scrypt, sool, parameetrid räsis)", async () => {
    const hash = await hashPassword("Väga-Pikk-Testparool-42");
    expect(hash).toMatch(/^scrypt\$32768\$8\$1\$/);
    expect(hash).not.toContain("Väga-Pikk-Testparool-42");
    expect(await verifyPassword("Väga-Pikk-Testparool-42", hash)).toBe(true);
    expect(await verifyPassword("vale-parool", hash)).toBe(false);
    // Sama parool → erinev räsi (juhuslik sool)
    expect(await hashPassword("Väga-Pikk-Testparool-42")).not.toBe(hash);
  });

  it("vigane räsi ei vii sisse", async () => {
    expect(await verifyPassword("x", "plain-text")).toBe(false);
    expect(await verifyPassword("x", "scrypt$1$1$1$AA$AA")).toBe(false);
  });

  it("nõrgad paroolid lükatakse tagasi", () => {
    expect(validatePasswordStrength("lühike")).toMatch(/12/);
    expect(validatePasswordStrength("password1234567")).toMatch(/lihtne/);
    expect(validatePasswordStrength("admin-admin-admin")).toMatch(/lihtne/);
    expect(validatePasswordStrength("aaaaaaaaaaaaaaaa")).toMatch(/lihtne/);
    expect(validatePasswordStrength("mari.tamm-Kevad2026", "mari.tamm@example.com")).toMatch(/e-posti/);
    expect(validatePasswordStrength("Kevadine-Rattasõit-29")).toBeNull();
  });
});

describe("suunamised", () => {
  it("pärast sisselogimist ainult admini lehtedele (open redirect kaitse)", () => {
    expect(safeAdminRedirect("/admin/pricing")).toBe("/admin/pricing");
    expect(safeAdminRedirect("https://evil.example")).toBe("/admin");
    expect(safeAdminRedirect("//evil.example/admin")).toBe("/admin");
    expect(safeAdminRedirect("/admin\\@evil")).toBe("/admin");
    expect(safeAdminRedirect("/admin/login")).toBe("/admin");
    expect(safeAdminRedirect(undefined)).toBe("/admin");
  });

  it("proxy suunab ilma sessiooniküpsiseta sisselogimisele ja lisab turvapäised", () => {
    const blocked = proxy(new NextRequest("http://localhost/admin/products/models?q=t14"));
    expect(blocked.status).toBe(307);
    expect(blocked.headers.get("location")).toBe("http://localhost/admin/login?next=%2Fadmin%2Fproducts%2Fmodels%3Fq%3Dt14");

    const login = proxy(new NextRequest("http://localhost/admin/login"));
    expect(login.headers.get("location")).toBeNull();
    expect(login.headers.get("x-robots-tag")).toContain("noindex");

    const withCookie = proxy(new NextRequest("http://localhost/admin", { headers: { cookie: `${SESSION_COOKIE}=abc` } }));
    expect(withCookie.headers.get("location")).toBeNull();
    expect(withCookie.headers.get("x-frame-options")).toBe("DENY");
    expect(withCookie.headers.get("cache-control")).toBe("no-store");
  });
});

describe.skipIf(!hasTestDatabase)("sessioonid ja sisselogimise piirang (andmebaas)", () => {
  let t: TestDatabase;
  let userId: string;

  beforeAll(async () => {
    t = await createTestDatabase();
    const [user] = await t.db
      .insert(adminUsers)
      .values({ email: "test@example.com", name: "Test", passwordHash: await hashPassword("Kevadine-Rattasõit-29") })
      .returning();
    userId = user.id;
  }, 60_000);
  afterAll(async () => {
    await t?.cleanup();
  });

  it("sessioon: andmebaasis ainult tokeni räsi, kehtib kuni aegumiseni, logout kustutab", async () => {
    const now = new Date();
    const { token, expiresAt } = await createSessionRecord(t.db, userId, { ip: "1.2.3.4", userAgent: "vitest" }, now);
    expect(token.length).toBeGreaterThanOrEqual(43);
    expect(expiresAt.getTime() - now.getTime()).toBe(SESSION_TTL_MS);

    const stored = await t.db.query.adminSessions.findFirst();
    expect(stored?.tokenHash).toBe(hashToken(token));
    expect(stored?.tokenHash).not.toBe(token);

    expect((await findSessionAdmin(t.db, token, now))?.email).toBe("test@example.com");
    expect(await findSessionAdmin(t.db, "vale-token", now)).toBeNull();
    expect(await findSessionAdmin(t.db, token, new Date(expiresAt.getTime() + 1000))).toBeNull();

    await deleteSessionRecord(t.db, token);
    expect(await findSessionAdmin(t.db, token, now)).toBeNull();
  });

  it("deaktiveeritud admini sessioon ei kehti", async () => {
    const { token } = await createSessionRecord(t.db, userId, { ip: null, userAgent: null });
    await t.db.update(adminUsers).set({ isActive: false });
    expect(await findSessionAdmin(t.db, token)).toBeNull();
    await t.db.update(adminUsers).set({ isActive: true });
  });

  it("piirang: 5 ebaõnnestunud katset samale e-postile blokeerib, teine e-post töötab", async () => {
    await t.db.delete(loginAttempts);
    for (let i = 0; i < MAX_FAILED_PER_EMAIL - 1; i++) await recordLoginAttempt(t.db, "victim@example.com", "10.0.0.1", false);
    expect(await isLoginBlocked(t.db, "victim@example.com", "10.0.0.1")).toBe(false);
    await recordLoginAttempt(t.db, "victim@example.com", "10.0.0.1", false);
    expect(await isLoginBlocked(t.db, "victim@example.com", "10.0.0.9")).toBe(true);
    expect(await isLoginBlocked(t.db, "other@example.com", "10.0.0.9")).toBe(false);
    // Aken möödub → uuesti lubatud
    expect(await isLoginBlocked(t.db, "victim@example.com", "10.0.0.9", new Date(Date.now() + 16 * 60 * 1000))).toBe(false);
  });

  it("piirang: 20 ebaõnnestunud katset samalt IP-lt blokeerib ka teised e-postid", async () => {
    await t.db.delete(loginAttempts);
    for (let i = 0; i < 20; i++) await recordLoginAttempt(t.db, `user${i}@example.com`, "10.9.9.9", false);
    expect(await isLoginBlocked(t.db, "new@example.com", "10.9.9.9")).toBe(true);
    expect(await isLoginBlocked(t.db, "new@example.com", "10.1.1.1")).toBe(false);
  });
});

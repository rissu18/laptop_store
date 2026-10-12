import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { NextRequest } from "next/server";

/**
 * Tech hinnakirja ajastatud sync'i otspunkt: ainult õige CRON_SECRET käivitab SAMA sync-teenuse
 * (runTechSyncNow — lukk, üks tehing). Saladust ega seerianumbreid vastuses pole.
 */

const mocks = vi.hoisted(() => ({
  run: vi.fn(),
  revalidateTag: vi.fn(),
  configured: true,
}));

vi.mock("@/server/catalog-sync/tech-runner", () => ({ runTechSyncNow: mocks.run }));
vi.mock("@/integrations/tech/tech-client", () => ({ isTechConfigured: () => mocks.configured }));
vi.mock("next/cache", () => ({ revalidateTag: mocks.revalidateTag }));

const SECRET = "test-cron-secret-0123456789abcdef";
const stats = { laptopRows: 730, validUnits: 327, groups: 206, created: 0, updated: 2, unchanged: 204, madeUnavailable: 0 };

const call = async (authorization?: string) => {
  const { GET } = await import("./route");
  const headers = new Headers();
  if (authorization !== undefined) headers.set("authorization", authorization);
  const response = await GET(new Request("https://example.test/api/cron/tech-sync", { headers }) as unknown as NextRequest);
  const text = await response.text();
  return { status: response.status, text, body: JSON.parse(text) as Record<string, unknown>, cache: response.headers.get("cache-control") };
};

describe("GET /api/cron/tech-sync", () => {
  beforeEach(() => {
    vi.stubEnv("CRON_SECRET", SECRET);
    mocks.configured = true;
    mocks.run.mockReset();
    mocks.revalidateTag.mockReset();
    mocks.run.mockResolvedValue({ status: "SUCCESS", runId: "run-1", snapshotTrusted: true, trustReason: null, changed: true, stats, models: [] });
  });
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("puuduv või vale Authorization → 401, sync ei käivitu", async () => {
    expect((await call()).status).toBe(401);
    for (const header of ["Bearer wrong-secret-0123456789abcdef", SECRET, `bearer ${SECRET}`]) {
      const res = await call(header);
      expect(res.status).toBe(401);
      expect(res.text).not.toContain(SECRET);
    }
    expect(mocks.run).not.toHaveBeenCalled();
  });

  it("CRON_SECRET puudub → 503 (fail-closed)", async () => {
    vi.stubEnv("CRON_SECRET", "");
    expect((await call(`Bearer ${SECRET}`)).status).toBe(503);
    expect(mocks.run).not.toHaveBeenCalled();
  });

  it("TECH_SHEET_URL seadistamata → 503, sync ei käivitu", async () => {
    mocks.configured = false;
    expect((await call(`Bearer ${SECRET}`)).status).toBe(503);
    expect(mocks.run).not.toHaveBeenCalled();
  });

  it("õige saladus → sama sync-teenus (trigger CRON), 200 + kokkuvõte, muutuste korral vahemälu aegub", async () => {
    const res = await call(`Bearer ${SECRET}`);
    expect(res.status).toBe(200);
    expect(res.cache).toBe("no-store");
    expect(mocks.run).toHaveBeenCalledWith({ trigger: "CRON", triggeredBy: "cron" });
    expect(res.body).toMatchObject({ status: "SUCCESS", runId: "run-1", stats: { groups: 206 } });
    expect(mocks.revalidateTag).toHaveBeenCalledWith("catalog", { expire: 0 });
  });

  it("teine sync käib → 200 BUSY; allika/parseri viga → 502 FAILED (eelmine seis jääb)", async () => {
    mocks.run.mockResolvedValueOnce({ status: "BUSY" });
    expect(await call(`Bearer ${SECRET}`)).toMatchObject({ status: 200, body: { status: "BUSY" } });
    mocks.run.mockResolvedValueOnce({ status: "FAILED", runId: "run-2", error: "Vigane snapshot (NO_STYLE_INFO)", stats: {} });
    const failed = await call(`Bearer ${SECRET}`);
    expect(failed).toMatchObject({ status: 502, body: { status: "FAILED", runId: "run-2" } });
    expect(failed.text).not.toContain("NO_STYLE_INFO");
    expect(mocks.revalidateTag).not.toHaveBeenCalled();
  });
});

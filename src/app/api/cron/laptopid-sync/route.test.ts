import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { NextRequest } from "next/server";

/**
 * Ajastatud sync'i otspunkt (välise ajastaja jaoks): ainult õige CRON_SECRET käivitab SAMA sync-teenuse
 * (runLaptopidSyncNow — lukk, üks tehing). Saladust vastuses ega veateates ei ole.
 */

const mocks = vi.hoisted(() => ({
  run: vi.fn(),
  revalidateTag: vi.fn(),
  configured: true,
}));

vi.mock("@/server/catalog-sync/laptopid-runner", () => ({ runLaptopidSyncNow: mocks.run }));
vi.mock("@/integrations/laptopid/laptopid-client", () => ({ isLaptopidConfigured: () => mocks.configured }));
vi.mock("next/cache", () => ({ revalidateTag: mocks.revalidateTag }));

const SECRET = "test-cron-secret-0123456789abcdef";
const stats = { received: 305, created: 0, updated: 2, unchanged: 303, madeUnavailable: 0, rejected: 0 };

const call = async (authorization?: string) => {
  const { GET } = await import("./route");
  const headers = new Headers();
  if (authorization !== undefined) headers.set("authorization", authorization);
  const response = await GET(new Request("https://example.test/api/cron/laptopid-sync", { headers }) as unknown as NextRequest);
  const text = await response.text();
  return { status: response.status, text, body: JSON.parse(text) as Record<string, unknown>, cache: response.headers.get("cache-control") };
};

describe("GET /api/cron/laptopid-sync", () => {
  beforeEach(() => {
    vi.stubEnv("CRON_SECRET", SECRET);
    mocks.configured = true;
    mocks.run.mockReset();
    mocks.revalidateTag.mockReset();
    mocks.run.mockResolvedValue({ status: "SUCCESS", runId: "run-1", snapshotTrusted: true, trustReason: null, rejected: [], changed: true, stats });
  });
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("ilma Authorization päiseta → 401, sync ei käivitu", async () => {
    const res = await call();
    expect(res.status).toBe(401);
    expect(mocks.run).not.toHaveBeenCalled();
  });

  it("vale secret (ka ilma Bearer eesliiteta või väiketähega) → 401, sync ei käivitu", async () => {
    for (const header of ["Bearer wrong-secret-0123456789abcdef", SECRET, `bearer ${SECRET}`, "Bearer "]) {
      const res = await call(header);
      expect(res.status).toBe(401);
      expect(res.text).not.toContain(SECRET);
    }
    expect(mocks.run).not.toHaveBeenCalled();
  });

  it("CRON_SECRET seadistamata või liiga lühike → 503 (fail-closed), ka õige-näoline päis ei aita", async () => {
    vi.stubEnv("CRON_SECRET", "");
    expect((await call("Bearer ")).status).toBe(503);
    vi.stubEnv("CRON_SECRET", "short");
    expect((await call("Bearer short")).status).toBe(503);
    expect(mocks.run).not.toHaveBeenCalled();
  });

  it("õige secret → sama sync-teenus (trigger CRON), kokkuvõte vastuses, vahemälu tühjendatakse", async () => {
    const res = await call(`Bearer ${SECRET}`);
    expect(res.status).toBe(200);
    expect(mocks.run).toHaveBeenCalledTimes(1);
    expect(mocks.run).toHaveBeenCalledWith({ trigger: "CRON", triggeredBy: "cron" });
    expect(res.body).toEqual({ status: "SUCCESS", runId: "run-1", snapshotTrusted: true, stats });
    expect(res.cache).toBe("no-store");
    expect(res.text).not.toContain(SECRET);
    expect(mocks.revalidateTag).toHaveBeenCalledTimes(1);
  });

  it("muutusteta sync → vahemälu ei tühjendata", async () => {
    mocks.run.mockResolvedValue({ status: "SUCCESS", runId: "run-2", snapshotTrusted: true, trustReason: null, rejected: [], changed: false, stats });
    expect((await call(`Bearer ${SECRET}`)).status).toBe(200);
    expect(mocks.revalidateTag).not.toHaveBeenCalled();
  });

  it("teine sync juba käib (lukk) → 200 BUSY, ajastaja ei saa viga ega käivita topelt", async () => {
    mocks.run.mockResolvedValue({ status: "BUSY" });
    const res = await call(`Bearer ${SECRET}`);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: "BUSY" });
    expect(mocks.revalidateTag).not.toHaveBeenCalled();
  });

  it("upstream viga → 502 ajastajale, vahemälu ei tühjendata (pood jääb viimase eduka seisu peale)", async () => {
    mocks.run.mockResolvedValue({ status: "FAILED", runId: "run-3", error: "products: HTTP 500", stats: {} });
    const res = await call(`Bearer ${SECRET}`);
    expect(res.status).toBe(502);
    expect(res.body).toEqual({ status: "FAILED", runId: "run-3" });
    expect(mocks.revalidateTag).not.toHaveBeenCalled();
  });

  it("Laptopid API seadistamata → 503, sync ei käivitu", async () => {
    mocks.configured = false;
    expect((await call(`Bearer ${SECRET}`)).status).toBe(503);
    expect(mocks.run).not.toHaveBeenCalled();
  });
});

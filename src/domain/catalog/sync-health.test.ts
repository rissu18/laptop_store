import { describe, expect, it } from "vitest";
import { SYNC_STALE_MESSAGE, formatAge, syncHealth } from "./sync-health";

const now = new Date("2026-10-11T12:00:00Z");
const minutesAgo = (m: number) => new Date(now.getTime() - m * 60_000);

describe("admini sync'i värskuse hoiatus", () => {
  it("värske edukas sync (5 min) → hoiatust pole", () => {
    expect(syncHealth(minutesAgo(5), now)).toMatchObject({ stale: false, ageLabel: "5 min tagasi" });
  });

  it("täpselt 15 min → veel ajakohane; üle 15 min → hoiatus", () => {
    expect(syncHealth(minutesAgo(15), now).stale).toBe(false);
    expect(syncHealth(minutesAgo(16), now).stale).toBe(true);
  });

  it("edukat sync'i pole → hoiatus, vanust ei leiutata", () => {
    expect(syncHealth(null, now)).toEqual({ lastSuccessAt: null, ageMs: null, ageLabel: null, stale: true });
  });

  it("ISO tekst (andmebaasist / JSON-ist) töötab samamoodi", () => {
    expect(syncHealth(minutesAgo(90).toISOString(), now)).toMatchObject({ stale: true, ageLabel: "1 h 30 min tagasi" });
  });

  it("vanuse tekst", () => {
    expect(formatAge(20_000)).toBe("alla minuti tagasi");
    expect(formatAge(120 * 60_000)).toBe("2 h tagasi");
    expect(formatAge(26 * 60 * 60_000)).toBe("1 päev tagasi");
    expect(formatAge(3 * 24 * 60 * 60_000)).toBe("3 päeva tagasi");
  });

  it("hoiatuse tekst", () => {
    expect(SYNC_STALE_MESSAGE).toBe("Automaatne sünkroonimine ei ole ajakohane.");
  });
});

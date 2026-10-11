import { describe, expect, it } from "vitest";
import { tallinnLocalToUtc } from "@/domain/time/tallinn";
import { SYNC_STALE_DAY_MS, SYNC_STALE_MESSAGE, SYNC_STALE_NIGHT_MS, formatAge, syncHealth, syncStaleAfterMs } from "./sync-health";

/** Eesti kohalik aeg ("2026-10-11T12:00") → UTC Date */
const tallinn = (local: string) => tallinnLocalToUtc(local) as Date;
const minutesBefore = (now: Date, m: number) => new Date(now.getTime() - m * 60_000);

const day = tallinn("2026-10-11T12:00"); // suveaeg (UTC+3)
const night = tallinn("2026-10-12T03:00");

describe("admini sync'i värskuse hoiatus (Europe/Tallinn)", () => {
  it("päeval: 30 ja 44 min → ajakohane; täpselt 45 → ajakohane; üle 45 → hoiatus", () => {
    expect(syncHealth(minutesBefore(day, 30), day)).toMatchObject({ stale: false, ageLabel: "30 min tagasi", staleAfterMs: SYNC_STALE_DAY_MS });
    expect(syncHealth(minutesBefore(day, 44), day).stale).toBe(false);
    expect(syncHealth(minutesBefore(day, 45), day).stale).toBe(false);
    expect(syncHealth(minutesBefore(day, 46), day).stale).toBe(true);
  });

  it("öösel: 120 ja 149 min → ajakohane; täpselt 150 → ajakohane; üle 150 → hoiatus", () => {
    expect(syncHealth(minutesBefore(night, 120), night)).toMatchObject({ stale: false, ageLabel: "2 h tagasi", staleAfterMs: SYNC_STALE_NIGHT_MS });
    expect(syncHealth(minutesBefore(night, 149), night).stale).toBe(false);
    expect(syncHealth(minutesBefore(night, 150), night).stale).toBe(false);
    expect(syncHealth(minutesBefore(night, 151), night).stale).toBe(true);
  });

  it.each([
    ["suveaeg (UTC+3)", "2026-10-11"],
    ["talveaeg (UTC+2)", "2026-12-15"],
  ])("piirid Eesti kohaliku aja järgi — %s", (_label, date) => {
    const next = new Date(new Date(`${date}T00:00:00Z`).getTime() + 86_400_000).toISOString().slice(0, 10);
    expect(syncStaleAfterMs(tallinn(`${date}T07:59`))).toBe(SYNC_STALE_NIGHT_MS);
    expect(syncStaleAfterMs(tallinn(`${date}T08:00`))).toBe(SYNC_STALE_DAY_MS);
    expect(syncStaleAfterMs(tallinn(`${date}T23:59`))).toBe(SYNC_STALE_DAY_MS);
    expect(syncStaleAfterMs(tallinn(`${next}T00:00`))).toBe(SYNC_STALE_NIGHT_MS);
  });

  it("kasutab Europe/Tallinn aega, mitte UTC-d ega fikseeritud nihet", () => {
    // 06:30 UTC = suvel 09:30 Eesti aeg (päev), talvel 08:30 (päev); 05:30 UTC talvel = 07:30 (öö), suvel 08:30 (päev)
    expect(syncStaleAfterMs(new Date("2026-10-11T06:30:00Z"))).toBe(SYNC_STALE_DAY_MS);
    expect(syncStaleAfterMs(new Date("2026-12-15T05:30:00Z"))).toBe(SYNC_STALE_NIGHT_MS);
    expect(syncStaleAfterMs(new Date("2026-10-11T05:30:00Z"))).toBe(SYNC_STALE_DAY_MS);
    // 22:30 UTC = suvel 01:30 (öö); talvel 00:30 (öö); 21:30 UTC talvel = 23:30 (päev)
    expect(syncStaleAfterMs(new Date("2026-10-11T22:30:00Z"))).toBe(SYNC_STALE_NIGHT_MS);
    expect(syncStaleAfterMs(new Date("2026-12-15T21:30:00Z"))).toBe(SYNC_STALE_DAY_MS);
  });

  it("edukat sync'i pole → hoiatus, vanust ei leiutata", () => {
    expect(syncHealth(null, day)).toEqual({ lastSuccessAt: null, ageMs: null, ageLabel: null, staleAfterMs: SYNC_STALE_DAY_MS, stale: true });
  });

  it("ISO tekst (andmebaasist / JSON-ist) töötab samamoodi", () => {
    expect(syncHealth(minutesBefore(day, 90).toISOString(), day)).toMatchObject({ stale: true, ageLabel: "1 h 30 min tagasi" });
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

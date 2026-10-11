import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * Mobiilse võrdlustabeli paigutuse regressioonid (kliendikomponent — kontrollitakse lähtekoodi;
 * käitumine on brauseris kontrollitud 375 / 390 / 430 px laiusel).
 */
const source = readFileSync(fileURLToPath(new URL("./compare-table.tsx", import.meta.url)), "utf8");

describe("võrdlustabel mobiilis", () => {
  it("kerimisala on positsioneeritud: lahtrite absoluutsed elemendid ei veni lehest laiemaks", () => {
    expect(source).toContain('<div className="relative overflow-x-auto overscroll-x-contain">');
  });

  it("kerimisalal pole sisemist paddingut (sticky veeru kõrval ei paista kerivad lahtrid)", () => {
    expect(source).not.toMatch(/overflow-x-auto[^"]*\bpx-4\b/);
    expect(source).toMatch(/const stickyCell = "sticky left-0 z-20 bg-surface pl-4/);
  });

  it("toote päise nupud ei joonistu sticky veeru peale (isolate)", () => {
    expect(source).toContain('<div className="relative isolate">');
  });

  it("erinevused värvitakse rühma järgi, võrdsed väärtused neutraalsed", () => {
    expect(source).toContain("const groups = differenceGroups(items.map(row.value));");
    expect(source).toContain("diffBackground(groups[index])");
    expect(source).toMatch(/group === null \? undefined/);
  });
});

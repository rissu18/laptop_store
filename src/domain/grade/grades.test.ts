import { describe, expect, it } from "vitest";
import { gradeFromParam, parseSupplierGrade } from "./grades";

describe("parseSupplierGrade", () => {
  it.each([
    ["A+", "A+"],
    ["Grade A+", "A+"],
    ["a plus", "A+"],
    ["Grade A", "A"],
    ["klass b", "B"],
    [" C ", "C"],
  ])("%s → %s", (raw, expected) => {
    expect(parseSupplierGrade(raw)).toBe(expected);
  });

  it("tundmatu klass → null (toodet ei impordita)", () => {
    expect(parseSupplierGrade("Grade Z")).toBeNull();
    expect(parseSupplierGrade("refurbished")).toBeNull();
  });
});

describe("gradeFromParam", () => {
  it("teisendab URL-i väärtuse klassiks", () => {
    expect(gradeFromParam("a-plus")).toBe("A+");
    expect(gradeFromParam("x")).toBeNull();
  });
});

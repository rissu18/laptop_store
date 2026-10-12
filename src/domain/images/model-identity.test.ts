import { describe, expect, it } from "vitest";
import { buildModelIdentity, compareModelName, cpuEraConflict, requiresStrictIdentifier, titleHasIdentity, titleScreenSize } from "./model-identity";

const id = (manufacturer: string, family: string, model: string, screenSizeIn: number | null = null) => buildModelIdentity({ manufacturer, family, model, screenSizeIn });

describe("Icecati nimevaste: tootja + mudeli identiteet", () => {
  it('HP EliteBook 840 G7 = "HP EliteBook 840 G7 Notebook PC"', () => {
    const ours = id("hp", "EliteBook", "840 G7", 14);
    expect(compareModelName(ours, "EliteBook 840 G7 Notebook PC").verdict).toBe("EXACT");
    expect(compareModelName(ours, "HP EliteBook 840 G7 Notebook PC").verdict).toBe("EXACT");
    expect(titleHasIdentity(ours, "HP EliteBook 840 G7 Notebook PC Intel® Core™ i5 i5-10210U Laptop 35.6 cm (14\") Full HD")).toBe(true);
  });

  it("840 G7 ≠ 840 G8 ja 840 ≠ 845", () => {
    const ours = id("hp", "EliteBook", "840 G7", 14);
    expect(compareModelName(ours, "EliteBook 840 G8 Notebook PC").verdict).toBe("REJECT");
    expect(compareModelName(ours, "EliteBook 845 G7 Notebook PC").verdict).toBe("REJECT");
    expect(titleHasIdentity(ours, "HP EliteBook 840 G8 Notebook PC Intel Core i5")).toBe(false);
  });

  it('840 G7 vs Icecati "EliteBook 840" (põlvkond puudub) → REVIEW', () => {
    expect(compareModelName(id("hp", "EliteBook", "840 G7"), "EliteBook 840").verdict).toBe("REVIEW");
  });

  it("T14s Gen 3 = ThinkPad T14s Gen 3 (Intel) ja masinatüübiga 21BR", () => {
    const ours = id("lenovo", "ThinkPad", "T14s Gen 3", 14);
    expect(compareModelName(ours, "ThinkPad T14s Gen 3 (Intel)").verdict).toBe("EXACT");
    expect(compareModelName(ours, "Lenovo ThinkPad T14s Gen 3 21BR").verdict).toBe("EXACT");
    expect(titleHasIdentity(ours, "Lenovo ThinkPad T14s Gen 3 (Intel) Intel® Core™ i5 i5-1245U Laptop 35.6 cm (14\") WUXGA")).toBe(true);
  });

  it("T14s Gen 3 ≠ T14 Gen 3 ja ≠ T14s Gen 2", () => {
    const ours = id("lenovo", "ThinkPad", "T14s Gen 3", 14);
    expect(compareModelName(ours, "ThinkPad T14 Gen 3 (Intel)").verdict).toBe("REJECT");
    expect(compareModelName(ours, "ThinkPad T14s Gen 2 (Intel)").verdict).toBe("REJECT");
    expect(titleHasIdentity(ours, "Lenovo ThinkPad T14 Gen 3 (Intel) Intel Core i5")).toBe(false);
    expect(compareModelName(id("lenovo", "ThinkPad", "T14 Gen 3"), "ThinkPad T14s Gen 3").verdict).toBe("REJECT");
  });

  it("Lenovo (6th Gen) = Gen 6; X1 Carbon Gen 9 ≠ Gen 10", () => {
    expect(compareModelName(id("lenovo", "ThinkPad", "X1 Carbon Gen 6"), "ThinkPad X1 Carbon (6th Gen)").verdict).toBe("EXACT");
    expect(compareModelName(id("lenovo", "ThinkPad", "X1 Carbon Gen 9"), "ThinkPad X1 Carbon Gen 10").verdict).toBe("REJECT");
  });

  it("Dell Latitude 7450 = \"Latitude 7450 Notebook\"; Latitude 7440 ≠ 7450", () => {
    const ours = id("dell", "Latitude", "7450", 14);
    expect(compareModelName(ours, "Latitude 7450 Notebook").verdict).toBe("EXACT");
    expect(compareModelName(id("dell", "Latitude", "7440", 14), "Latitude 7450").verdict).toBe("REJECT");
  });

  it("Dell indeksis ainult number → FAMILY_MISSING; pealkiri peab seeria kinnitama (Latitude ≠ Precision)", () => {
    const latitude = id("dell", "Latitude", "5490", 14);
    expect(compareModelName(latitude, "5490").verdict).toBe("FAMILY_MISSING");
    expect(titleHasIdentity(latitude, "DELL Latitude 5490 Intel® Core™ i5 i5-8350U Laptop 35.6 cm (14\") Full HD")).toBe(true);
    expect(titleHasIdentity(latitude, "DELL Precision 5490 Intel Core Ultra 7 165H Mobile workstation 35.6 cm (14\")")).toBe(false);
  });

  it("Precision 5680 = Precision 5680; ≠ 5690", () => {
    const ours = id("dell", "Precision", "5680", 16);
    expect(compareModelName(ours, "Precision 5680").verdict).toBe("EXACT");
    expect(titleHasIdentity(ours, "DELL Precision 5680 Intel® Core™ i7 i7-13700H Mobile workstation 40.6 cm (16\")")).toBe(true);
    expect(compareModelName(ours, "Precision 5690").verdict).toBe("REJECT");
  });

  it("x360 ≠ tavaline; Yoga ≠ tavaline; P14 ≠ P14s; X13 ≠ X13 Yoga", () => {
    expect(compareModelName(id("hp", "EliteBook", "1040 G9"), "EliteBook x360 1040 G9").verdict).toBe("REJECT");
    expect(titleHasIdentity(id("hp", "EliteBook", "1040 G9", 14), "HP EliteBook x360 1040 G9 Intel Core i7")).toBe(false);
    expect(compareModelName(id("hp", "EliteBook", "x360 1040 G9"), "EliteBook 1040 G9").verdict).toBe("REJECT");
    expect(compareModelName(id("lenovo", "ThinkPad", "X13 Gen 2"), "ThinkPad X13 Yoga Gen 2").verdict).toBe("REJECT");
    expect(compareModelName(id("lenovo", "ThinkPad P", "P14s Gen 2"), "ThinkPad P14 Gen 2").verdict).toBe("REJECT");
    expect(compareModelName(id("lenovo", "ThinkPad P", "P14 Gen 2"), "ThinkPad P14s Gen 2").verdict).toBe("REJECT");
  });

  it("Rugged ≠ tavaline (ka pealkirjas mujal), Chromebook ≠ tavaline", () => {
    const ours = id("dell", "Latitude", "5430", 14);
    expect(compareModelName(ours, "Latitude 5430 Rugged").verdict).toBe("REJECT");
    expect(titleHasIdentity(ours, "DELL Latitude 5430 Rugged Intel Core i5")).toBe(false);
    expect(titleHasIdentity(ours, "DELL Latitude 5430 Intel® Core™ i3 i3-1215U Chromebook 35.6 cm (14\")")).toBe(false);
    expect(compareModelName(id("dell", "Latitude", "5430 Rugged"), "Latitude 5430").verdict).toBe("REJECT");
  });

  it("Yoga / Flex on ise 2-in-1 (Icecati \"Hybrid (2-in-1)\" on lubatud); 2-in-1 sõnajärg võib erineda", () => {
    expect(titleHasIdentity(id("lenovo", "ThinkPad", "X13 Yoga Gen 2", 13.3), "Lenovo ThinkPad X13 Yoga Gen 2 (Intel) Intel® Core™ i5 Hybrid (2-in-1) 33.8 cm (13.3\")")).toBe(true);
    expect(titleHasIdentity(id("lenovo", "ThinkPad", "L13 Gen 5 2-in-1", 13.3), "Lenovo ThinkPad L13 2-in-1 Gen 5 (Intel) Intel Core Ultra 5 Hybrid (2-in-1) 33.8 cm (13.3\")")).toBe(true);
    expect(titleHasIdentity(id("lenovo", "ThinkPad", "X13 Gen 2", 13.3), "Lenovo ThinkPad X13 Gen 2 Hybrid (2-in-1) 33.8 cm (13.3\")")).toBe(false);
  });

  it("ekraani suurus: Firefly 14 G11 ≠ Firefly G11 16\"; HP lisab suuruse mudelinimesse (\"860 16 G10\")", () => {
    const firefly14 = id("hp", "ZBook", "Firefly 14 G11", 14);
    expect(titleHasIdentity(firefly14, "HP ZBook Firefly G11 Intel Core Ultra 7 155H Mobile workstation 40.6 cm (16\")")).toBe(false);
    expect(titleHasIdentity(firefly14, "HP ZBook Firefly G11 Intel Core Ultra 7 165H Mobile workstation 35.6 cm (14\")")).toBe(true);
    expect(compareModelName(firefly14, "ZBook Firefly 16 G11").verdict).toBe("REJECT");
    expect(titleHasIdentity(id("hp", "EliteBook", "860 G10", 16), "HP EliteBook 860 16 G10 Intel Core i7 40.6 cm (16\")")).toBe(true);
    expect(titleScreenSize('Laptop 39.6 cm (15.6") Full HD')).toBe(15.6);
  });

  it("põlvkonnata mudelinimi, Icecatis põlvkonnaga variandid → mitmetähenduslik (generationVariant)", () => {
    expect(compareModelName(id("lenovo", "ThinkPad", "X13"), "ThinkPad X13 Gen 2 (AMD)")).toMatchObject({ verdict: "REJECT", generationVariant: true });
  });

  it("sama nimi teisest ajastust: Icecati CPU ≥ 3 põlvkonda erinev → konflikt", () => {
    expect(cpuEraConflict("DELL XPS 15 9530 Intel® Core™ i7 i7-4712HQ", ["Intel Core i7-13700H"])).toBe(true);
    expect(cpuEraConflict("DELL Latitude 5410 Intel® Core™ i5 i5-10310U", ["Intel Core i5-10210U"])).toBe(false);
    expect(cpuEraConflict("HP EliteBook 840 G8 i5-1145G7", ["i5-1135G7"])).toBe(false);
    expect(cpuEraConflict("Lenovo ThinkPad E14 Gen 3 AMD Ryzen™ 7 5700U", ["AMD Ryzen 5 5500U"])).toBe(false);
  });

  it("Apple: ainult nime järgi automaatset vastet ei tehta (REVIEW)", () => {
    expect(requiresStrictIdentifier("apple")).toBe(true);
    expect(requiresStrictIdentifier("lenovo")).toBe(false);
  });
});

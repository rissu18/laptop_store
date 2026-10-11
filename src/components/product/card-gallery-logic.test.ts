import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it, vi } from "vitest";
import { hasImageNavigation, indexFromScroll, shouldLoadSlide, stopCardNavigation, wrapIndex } from "./card-gallery-logic";

const source = (file: string) => readFileSync(fileURLToPath(new URL(file, import.meta.url)), "utf8");

describe("tootekaardi pildisirvija", () => {
  it("ühe pildiga (või pildita) kaardil navigeerimist pole; kaart kasutab tavalist ProductImage'it", () => {
    expect(hasImageNavigation(0)).toBe(false);
    expect(hasImageNavigation(1)).toBe(false);
    expect(hasImageNavigation(2)).toBe(true);
    const card = source("./product-card.tsx");
    expect(card).toMatch(/hasImageNavigation\(images\.length\) \? \(\s*<ProductCardImages/);
    expect(card).toMatch(/\) : \(\s*<ProductImage item=\{item\}/);
  });

  it("mobiilis pühkimine vahetab pilti (scroll-snap asukoht → pildi indeks)", () => {
    expect(indexFromScroll(0, 340, 3)).toBe(0);
    expect(indexFromScroll(340, 340, 3)).toBe(1);
    expect(indexFromScroll(520, 340, 3)).toBe(2);
    expect(indexFromScroll(9999, 340, 3)).toBe(2);
    expect(indexFromScroll(100, 0, 3)).toBe(0);
  });

  it("desktopi nooled jätkavad ringiga nagu tootelehe galerii", () => {
    expect(wrapIndex(3, 3)).toBe(0);
    expect(wrapIndex(-1, 3)).toBe(2);
  });

  it("noole klõps ei ava tootelehte: vaikekäitumine ja levik peatatakse", () => {
    const event = { preventDefault: vi.fn(), stopPropagation: vi.fn() };
    stopCardNavigation(event);
    expect(event.preventDefault).toHaveBeenCalled();
    expect(event.stopPropagation).toHaveBeenCalled();
    const gallery = source("./product-card-images.tsx");
    // mõlemad nooled kutsuvad stopCardNavigation'it enne pildi vahetamist
    expect(gallery.match(/stopCardNavigation\(event\);\s*goTo\(index [-+] 1\)/g)).toHaveLength(2);
    // nooled ainult desktopil (mobiilis pühkimine)
    expect(gallery.match(/hidden size-9[^"]*md:flex/g)).toHaveLength(2);
  });

  it("laetakse ainult nähtav pilt ja naabrid; nähtud pildid jäävad", () => {
    const seen = new Set([0]);
    expect([0, 1, 2, 3, 4].map((i) => shouldLoadSlide(i, 0, 5, seen))).toEqual([true, true, false, false, true]);
    expect(shouldLoadSlide(0, 3, 5, seen)).toBe(true);
  });
});

import { describe, expect, it } from "vitest";
import { formatStorage } from "./format";

describe("formatStorage", () => {
  it("GB / binaarne TB / tarnija kümnendkujul TB", () => {
    expect(formatStorage(256)).toBe("256 GB");
    expect(formatStorage(512)).toBe("512 GB");
    expect(formatStorage(1024)).toBe("1 TB");
    expect(formatStorage(1536)).toBe("1,5 TB");
    expect(formatStorage(2048)).toBe("2 TB");
    expect(formatStorage(1000)).toBe("1 TB");
    expect(formatStorage(2000)).toBe("2 TB");
  });
});

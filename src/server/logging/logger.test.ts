import { describe, expect, it } from "vitest";
import { redact } from "./logger";

describe("redact", () => {
  it("peidab tokenid, paroolid ja võtmed ka pesastatud objektides", () => {
    const result = redact({
      identifier: "MPN Dell 5420-0457",
      apiToken: "abc",
      headers: { "content-token": "def", Accept: "application/json" },
      user: { password: "hunter2" },
    });
    expect(JSON.stringify(result)).not.toMatch(/abc|def|hunter2/);
    expect(result).toMatchObject({ identifier: "MPN Dell 5420-0457", headers: { Accept: "application/json" } });
  });
});

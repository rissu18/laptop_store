import { describe, expect, it } from "vitest";
import { syncLogLevel } from "./sync-log-level";

describe("sync'i logitase", () => {
  it("edukas, probleemideta → INFO", () => {
    expect(syncLogLevel({ status: "SUCCESS", trusted: true, alerts: { conflicts: 0 }, backlog: { invalidRows: 0 }, previous: { invalidRows: 0 } })).toBe("INFO");
  });

  it("ebaõnnestunud → ERROR", () => {
    expect(syncLogLevel({ status: "FAILED" })).toBe("ERROR");
  });

  it("hoiatus: usaldamatu snapshot, häire või kasvanud jääk → WARN", () => {
    expect(syncLogLevel({ status: "SUCCESS", trusted: false })).toBe("WARN");
    expect(syncLogLevel({ status: "SUCCESS", trusted: true, alerts: { unknownFaults: 1 } })).toBe("WARN");
    expect(syncLogLevel({ status: "SUCCESS", trusted: true, backlog: { review: 15 }, previous: { review: 14 } })).toBe("WARN");
    // Esimene sync jäägiga (eelmist pole)
    expect(syncLogLevel({ status: "SUCCESS", trusted: true, backlog: { review: 14 }, previous: null })).toBe("WARN");
  });

  it("teadaolev jääk sama või väiksem → INFO (korduv jääk ei ole uus hoiatus)", () => {
    expect(syncLogLevel({ status: "SUCCESS", trusted: true, backlog: { review: 14, invalidRows: 1 }, previous: { review: 14, invalidRows: 1 } })).toBe("INFO");
    expect(syncLogLevel({ status: "SUCCESS", trusted: true, backlog: { imageErrors: 2 }, previous: { imageErrors: 3 } })).toBe("INFO");
  });
});

import { describe, expect, it } from "vitest";
import { icecatProduct } from "./icecat-fixtures";
import { buildIdentifierQueue, matchModel, type IcecatLookup, type ModelIdentifiers } from "./icecat-matcher";
import { describeIdentifier, type IcecatLookupResult } from "./icecat-types";

const model = { id: "dell-latitude-5420", brandName: "Dell", modelName: "Latitude 5420" };
const noIds: ModelIdentifiers = { gtins: [], mpns: [], icecatIds: [] };

/** Võlts-Icecat: vastab etteantud identifikaatoritele, logib päringud. */
function fakeIcecat(responses: Record<string, IcecatLookupResult>): IcecatLookup & { calls: string[] } {
  const calls: string[] = [];
  return {
    calls,
    async getProduct(identifier) {
      const key = describeIdentifier(identifier);
      calls.push(key);
      return responses[key] ?? { status: "NOT_FOUND", message: "Products datasheet is not yet released" };
    },
  };
}

describe("buildIdentifierQueue", () => {
  it("järjekord: admini kinnitus → GTIN → MPN → Icecat ID", () => {
    const queue = buildIdentifierQueue(model, {
      gtins: ["0884116437888"],
      mpns: ["5420-0457"],
      icecatIds: ["95037175"],
      confirmedIcecatId: "1",
    });
    expect(queue.map((q) => q.matchType)).toEqual(["MANUAL", "GTIN", "MPN", "ICECAT_ID"]);
  });

  it("eemaldab vigased ja korduvad identifikaatorid", () => {
    const queue = buildIdentifierQueue(model, { gtins: ["abc", "0884116437888", "0884116437888"], mpns: [" "], icecatIds: ["x1"] });
    expect(queue).toHaveLength(1);
  });
});

describe("matchModel", () => {
  it("kasutab GTIN-i enne MPN-i ja lõpetab esimese kindla vaste juures", async () => {
    const icecat = fakeIcecat({ "GTIN 0884116437888": { status: "FOUND", product: icecatProduct() } });
    const result = await matchModel(model, { ...noIds, gtins: ["0884116437888"], mpns: ["5420-0457"] }, icecat);
    expect(result.status).toBe("MATCHED");
    expect(result.status === "MATCHED" && result.matchType).toBe("GTIN");
    expect(icecat.calls).toEqual(["GTIN 0884116437888"]);
  });

  it("proovib järgmist identifikaatorit, kui eelmine ei leia midagi", async () => {
    const icecat = fakeIcecat({ "MPN Dell 5420-0457": { status: "FOUND", product: icecatProduct() } });
    const result = await matchModel(model, { ...noIds, gtins: ["0884116437888"], mpns: ["5420-0457"] }, icecat);
    expect(result.status === "MATCHED" && result.matchType).toBe("MPN");
    expect(icecat.calls).toEqual(["GTIN 0884116437888", "MPN Dell 5420-0457"]);
  });

  it("vale mudeli pealkiri → NEEDS_REVIEW, mitte live", async () => {
    const wrong = icecatProduct({ title: "DELL Latitude 7420 Intel® Core™ i7" });
    const icecat = fakeIcecat({ "MPN Dell 5420-0457": { status: "FOUND", product: wrong } });
    const result = await matchModel(model, { ...noIds, mpns: ["5420-0457"] }, icecat);
    expect(result.status).toBe("NEEDS_REVIEW");
  });

  it("ebakindla vaste järel otsitakse edasi ja kindel vaste võidab", async () => {
    const wrong = icecatProduct({ title: "DELL Latitude 7420", icecatId: "1" });
    const icecat = fakeIcecat({
      "MPN Dell WRONG": { status: "FOUND", product: wrong },
      "Icecat ID 95037175": { status: "FOUND", product: icecatProduct() },
    });
    const result = await matchModel(model, { ...noIds, mpns: ["WRONG"], icecatIds: ["95037175"] }, icecat);
    expect(result.status).toBe("MATCHED");
  });

  it("admini tagasi lükatud vastet ei kasutata", async () => {
    const icecat = fakeIcecat({ "Icecat ID 95037175": { status: "FOUND", product: icecatProduct() } });
    const result = await matchModel(model, { ...noIds, icecatIds: ["95037175"], rejectedIcecatIds: ["95037175"] }, icecat);
    expect(result.status).toBe("NOT_FOUND");
  });

  it("admini käsitsi vaste on kõrgeima prioriteediga", async () => {
    const icecat = fakeIcecat({
      "Icecat ID 777": { status: "FOUND", product: icecatProduct({ icecatId: "777" }) },
      "GTIN 0884116437888": { status: "FOUND", product: icecatProduct() },
    });
    const result = await matchModel(model, { ...noIds, gtins: ["0884116437888"], confirmedIcecatId: "777" }, icecat);
    expect(result).toMatchObject({ status: "MATCHED", matchType: "MANUAL", confidence: 1 });
    expect(icecat.calls).toEqual(["Icecat ID 777"]);
  });

  it("ilma identifikaatoriteta → NOT_FOUND (NO_IDENTIFIERS) ja ei tee ühtegi päringut", async () => {
    const icecat = fakeIcecat({});
    expect(await matchModel(model, noIds, icecat)).toMatchObject({ status: "NOT_FOUND", reason: "NO_IDENTIFIERS" });
    expect(icecat.calls).toHaveLength(0);
  });

  it("Icecati tehniline viga → ERROR, mitte NOT_FOUND", async () => {
    const icecat = fakeIcecat({ "MPN Dell 5420-0457": { status: "ERROR", message: "HTTP 503" } });
    expect(await matchModel(model, { ...noIds, mpns: ["5420-0457"] }, icecat)).toMatchObject({ status: "ERROR", reason: "ICECAT_UNAVAILABLE" });
  });
});

import { describe, expect, it } from "vitest";
import { galleryItem, icecatProduct } from "@/integrations/icecat/icecat-fixtures";
import { filterIndexLines, parseIndexFileLine, type IcecatIndexRow } from "@/integrations/icecat/icecat-index";
import type { IcecatIdentifier, IcecatLookupResult, IcecatProduct } from "@/integrations/icecat/icecat-types";
import { IcecatIndexCandidates, resolveByIdentity } from "./icecat-model-search";

const line = (id: string, supplier: string, name: string, extra = 'Quality="ICECAT" On_Market="1" HighPic="https://images.icecat.biz/x.jpg"', catid = "151") =>
  `<file path="export/freexml/EN/${id}.xml" Limited="No" ${extra} Product_ID="${id}" Updated="20260101000000" Prod_ID="P${id}" Supplier_id="${supplier}" Catid="${catid}" Model_Name="${name}" Date_Added="20200101000000">`;

async function* lines(list: string[]) {
  yield* list;
}

function client(products: Record<string, IcecatProduct>) {
  const calls: string[] = [];
  return {
    calls,
    async getProduct(identifier: IcecatIdentifier): Promise<IcecatLookupResult> {
      const key = identifier.kind === "ICECAT_ID" ? identifier.icecatId : "";
      calls.push(key);
      const product = products[key];
      return product ? { status: "FOUND", product } : { status: "NOT_FOUND", message: "not found" };
    },
  };
}

const gallery = (n: number) => Array.from({ length: n }, (_, i) => galleryItem(String(500 + i), i + 1));

describe("Icecati indeksi voog", () => {
  it("parsib <file> rea ja jätab alles ainult sülearvutid meie tootjatelt", async () => {
    const row = parseIndexFileLine(line("1", "1", "EliteBook 840 G7 Notebook PC"));
    expect(row).toMatchObject({ productId: "1", supplierId: "1", catid: "151", quality: "ICECAT", onMarket: true, hasHighPic: true, modelName: "EliteBook 840 G7 Notebook PC" });
    expect(parseIndexFileLine("<EAN_UPC Value=\"1\"/>")).toBeNull();

    const kept: IcecatIndexRow[] = [];
    const stats = await filterIndexLines(
      lines([line("1", "1", "EliteBook 840 G7"), line("2", "1", "Ink cartridge 80", undefined, "846"), line("3", "30492", "HP EliteBook 840 G7 Refurbished"), "<M_Prod_ID>x</M_Prod_ID>"]),
      new Set(["1"]),
      (r) => kept.push(r),
    );
    expect(stats).toEqual({ products: 3, kept: 1 });
    expect(kept.map((r) => r.productId)).toEqual(["1"]);
  });
});

describe("tootja + mudeli identiteedi otsing (GTIN/MPN puudub)", () => {
  const models = [
    { id: "hp-elitebook-840-g7", manufacturer: "hp", family: "EliteBook", model: "840 G7", screenSizeIn: 14 },
    { id: "lenovo-thinkpad-t14s-gen-3", manufacturer: "lenovo", family: "ThinkPad", model: "T14s Gen 3", screenSizeIn: 14 },
    { id: "lenovo-thinkpad-x13", manufacturer: "lenovo", family: "ThinkPad", model: "X13", screenSizeIn: 13.3 },
  ];

  function collect(rows: string[]) {
    const index = new IcecatIndexCandidates(models);
    for (const l of rows) index.consider(parseIndexFileLine(l)!);
    return index;
  }

  it("ilma GTIN/MPN-ita otsitakse mudelinime järgi; valitakse suurima kontrollitud galeriiga toode", async () => {
    const index = collect([
      line("10", "1", "EliteBook 840 G7 Notebook PC", 'Quality="SUPPLIER" On_Market="0"'),
      line("11", "1", "EliteBook 840 G7 Notebook PC"),
      line("12", "1", "EliteBook 840 G8 Notebook PC"),
      line("13", "728", "EliteBook 840 G7"), // teine tootja
    ]);
    expect(index.candidatesFor("hp-elitebook-840-g7").map((c) => c.row.productId)).toEqual(["11", "10"]);

    const icecat = client({
      "10": icecatProduct({ icecatId: "10", title: "EliteBook 840 G7 Notebook PC", gallery: gallery(1) }),
      "11": icecatProduct({ icecatId: "11", title: "EliteBook 840 G7 Notebook PC Intel Core i5 35.6 cm (14\")", gallery: gallery(7) }),
    });
    const result = await resolveByIdentity(index.identity("hp-elitebook-840-g7")!, index.candidatesFor("hp-elitebook-840-g7"), icecat);
    expect(result).toMatchObject({ status: "MATCHED", imageCount: 7 });
    expect(result.status === "MATCHED" && result.product.GeneralInfo.IcecatId).toBe("11");
  });

  it("pealkiri ei kinnita mudelit → NEEDS_REVIEW (pilte ei võeta)", async () => {
    const index = collect([line("20", "728", "ThinkPad T14s Gen 3 (Intel)")]);
    const icecat = client({ "20": icecatProduct({ icecatId: "20", title: "Lenovo ThinkPad T14 Gen 3 Intel Core i5" }) });
    const result = await resolveByIdentity(index.identity("lenovo-thinkpad-t14s-gen-3")!, index.candidatesFor("lenovo-thinkpad-t14s-gen-3"), icecat);
    expect(result.status).toBe("NEEDS_REVIEW");
  });

  it("põlvkonnata mudel, Icecatis mitu põlvkonda → NEEDS_REVIEW ilma päringuta", async () => {
    const index = collect([line("30", "728", "X13"), line("31", "728", "ThinkPad X13 Gen 2 (AMD)")]);
    expect(index.hasGenerationVariants("lenovo-thinkpad-x13")).toBe(true);
    const icecat = client({});
    const result = await resolveByIdentity(index.identity("lenovo-thinkpad-x13")!, index.candidatesFor("lenovo-thinkpad-x13"), icecat, { ambiguousGeneration: true });
    expect(result.status).toBe("NEEDS_REVIEW");
    expect(icecat.calls).toHaveLength(0);
  });

  it("sobivat nime pole → NOT_FOUND; admini tagasi lükatud Icecat ID-d ei pakuta", async () => {
    const index = collect([line("40", "1", "EliteBook 840 G7")]);
    const icecat = client({ "40": icecatProduct({ icecatId: "40", title: "HP EliteBook 840 G7", gallery: gallery(3) }) });
    const identity = index.identity("hp-elitebook-840-g7")!;
    expect((await resolveByIdentity(identity, [], icecat)).status).toBe("NOT_FOUND");
    expect((await resolveByIdentity(identity, index.candidatesFor("hp-elitebook-840-g7"), icecat, { rejectedIcecatIds: new Set(["40"]) })).status).toBe("NOT_FOUND");
  });
});

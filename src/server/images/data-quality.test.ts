import { describe, expect, it } from "vitest";
import type { IcecatMatchRecord } from "@/domain/images/icecat-match";
import type { ProductImageRecord } from "@/domain/images/product-image";
import { buildDataQualityOverview } from "./data-quality";

const match = (id: string, status: IcecatMatchRecord["status"], reason: IcecatMatchRecord["reason"] = null) =>
  ({ productModelId: id, status, reason }) as IcecatMatchRecord;
const images = (count: number, hidden = 0) =>
  Array.from({ length: count }, (_, i) => ({ sourceId: String(i), position: i, isHidden: i < hidden }) as ProductImageRecord);

describe("buildDataQualityOverview", () => {
  const models = ["a", "b", "c", "d", "e"].map((id) => ({ id, title: id.toUpperCase(), listingCount: 1 }));
  const overview = buildDataQualityOverview(
    models,
    [match("a", "MATCHED"), match("b", "MATCHED"), match("c", "NOT_FOUND", "NO_IDENTIFIERS"), match("d", "ERROR", "ICECAT_UNAVAILABLE")],
    { a: images(5), b: images(2, 1) },
  );

  it("loeb kokku pildikatte ja Icecati staatused", () => {
    expect(overview.modelsTotal).toBe(5);
    expect(overview.images).toEqual({ withImages: 2, withoutImages: 3, coveragePct: 40 });
    expect(overview.icecat).toMatchObject({ MATCHED: 2, NOT_FOUND: 1, ERROR: 1, NOT_CHECKED: 1 });
  });

  it("peidetud pilte ei arvestata", () => {
    expect(overview.gallery).toEqual({ mainImageOnly: 1, multipleImages: 1, averageImages: 3 });
  });

  it("annab nimekirja mudelitest, millega tuleb käsitsi tegeleda", () => {
    expect(overview.modelsWithoutImages.map((r) => r.id)).toEqual(["c", "d", "e"]);
  });
});

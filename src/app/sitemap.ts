import type { MetadataRoute } from "next";
import { storeConfig } from "@/config/store";
import { BRAND_CODES } from "@/domain/catalog/types";
import { productPath } from "@/domain/catalog/urls";
import { getAllProductSlugs } from "@/server/catalog/catalog-service";

/** Ainult indekseeritavad lehed: mitte filtritega URL-id ega konfiguratsioonide parameetrid. */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const url = (path: string) => new URL(path, storeConfig.siteUrl).toString();
  const slugs = await getAllProductSlugs();
  return [
    { url: url("/"), changeFrequency: "daily", priority: 1 },
    { url: url("/sulearvutid"), changeFrequency: "hourly", priority: 0.9 },
    ...BRAND_CODES.map((brand) => ({ url: url(`/sulearvutid/${brand}`), changeFrequency: "daily" as const, priority: 0.8 })),
    { url: url("/parimad-pakkumised"), changeFrequency: "daily", priority: 0.7 },
    { url: url("/seisukorrad"), changeFrequency: "monthly", priority: 0.4 },
    ...slugs.map((slug) => ({ url: url(productPath(slug)), changeFrequency: "daily" as const, priority: 0.6 })),
  ];
}

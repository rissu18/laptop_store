import type { MetadataRoute } from "next";
import { storeConfig } from "@/config/store";
import { getSettings } from "@/server/settings/settings-service";

export default async function robots(): Promise<MetadataRoute.Robots> {
  // Prototüüpi ei indekseerita
  if ((await getSettings()).store.prototypeMode) return { rules: { userAgent: "*", disallow: "/" } };
  return {
    rules: { userAgent: "*", allow: "/", disallow: ["/admin", "/api", "/ostukorv", "/kassa", "/vordlus"] },
    sitemap: new URL("/sitemap.xml", storeConfig.siteUrl).toString(),
  };
}

import type { MetadataRoute } from "next";
import { storeConfig } from "@/config/store";

export default function robots(): MetadataRoute.Robots {
  // Prototüüpi ei indekseerita
  if (storeConfig.prototypeMode) return { rules: { userAgent: "*", disallow: "/" } };
  return {
    rules: { userAgent: "*", allow: "/", disallow: ["/admin", "/api", "/ostukorv", "/kassa", "/vordlus"] },
    sitemap: new URL("/sitemap.xml", storeConfig.siteUrl).toString(),
  };
}

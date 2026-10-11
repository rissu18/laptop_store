import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  cacheComponents: true,
  partialPrefetching: true,
  images: {
    // Tarnija tootepildid (Laptopid.ee). Ainult see host ja tootepiltide tee — mitte kogu domeen.
    remotePatterns: [{ protocol: "https", hostname: "laptopid.ee", pathname: "/images/product/**" }],
    // Optimeeritud pilt hoitakse vahemälus vähemalt 31 päeva (Laptopid annab pildile uue ID, kui see muutub)
    minimumCacheTTL: 2_678_400,
    maximumRedirects: 0,
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;

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
    // Iga erinev laius = eraldi pilditeisendus (Verceli limiit). Vaikimisi 15 laiust → 9, mis katavad meie
    // paigutused 1×/2×/3× ekraanil: pisipildid 56–128 px, kaardid ~330 px / 100vw, galerii ~690 px,
    // hero 560 px, täisekraan 100vw. 2048/3840 eemaldatud: enamik tarnija pilte on niikuinii ≤ 2000 px
    // (suuremaks ei venitata), täisekraanil kõrge DPR-iga piisab 2560-st. Vt docs/ARCHITECTURE.md → Jõudlus.
    deviceSizes: [640, 828, 1200, 1920, 2560],
    imageSizes: [64, 128, 256, 384],
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

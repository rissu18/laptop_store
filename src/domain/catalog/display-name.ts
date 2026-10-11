import { productTitle } from "./title";
import { BRAND_NAMES, type BrandCode } from "./types";

/**
 * Kliendile nähtav mudelinimi. Lenovo: "Gen 4" → "G4" (lühem kirjapilt, nagu Laptopid.ee-s).
 *
 * AINULT kuvamiseks: andmebaasi mudelinimi, mudeli slug ja sync'i sobitamine kasutavad edasi
 * kanoonilist "Gen N" kuju (canonicalModelName / productTitle), et duplikaate ei tekiks.
 * Otsing leiab mõlemad kujud (search.ts → buildSearchText).
 */
export function displayModelName(brand: BrandCode, model: string): string {
  if (brand !== "lenovo") return model;
  return model.replace(/\bGen\s*(\d{1,2})\b/g, "G$1");
}

/** "Lenovo ThinkPad T14 G4" — sama reegel nagu productTitle, aga kuvatava mudelinimega */
export function displayProductTitle(brand: BrandCode, series: string, model: string): string {
  return productTitle(BRAND_NAMES[brand], series, displayModelName(brand, model));
}

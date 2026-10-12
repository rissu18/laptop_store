import { productTitle } from "@/domain/catalog/title";
import { BRAND_NAMES, type BrandCode } from "@/domain/catalog/types";
import { canonicalModelName, parseBrand, slugify, splitSeries } from "./model-names";

/**
 * Tootja + mudelinimi → ProductModel viide (jagatud kõigi tarnijate vahel: Laptopid.ee, Tech …).
 * Sama arvutus annab sama slug'i, seega eri tarnijate sama mudel leiab sama ProductModeli (vaste = täpne slug).
 */

export interface ModelRef {
  brand: BrandCode;
  series: string;
  model: string;
  generation: string | null;
  /** Mudeli slug — sama arvutus mis olemasolevatel mudelitel (tootja + seeria + mudel) */
  slug: string;
  title: string;
  /** Seeria taksonoomia oli tundmatu ja kasutati konservatiivset tagavara (sync logib hoiatuse) */
  taxonomyWarning: string | null;
}

export class ModelResolutionError extends Error {}

/**
 * Lenovo V-seeria (äriklassi soodne liin): "V330-14IKB", "V340-17IWL", "V14 G2 ITL", "V15-IIL".
 * Konservatiivne muster — mitte iga "V"-ga algav nimi (nt "Vostro" on Delli, mitte Lenovo).
 */
const LENOVO_V_SERIES = /^V(?:\d{3}-\d{2}[A-Z]{2,4}\d?|1[3457](?=[\s-]|$))/i;

/**
 * Tootja + mudel → seeria ja mudel. Järjekord:
 *   1. teadaolevad seeriad (splitSeries)          → nt ThinkPad, Latitude, EliteBook
 *   2. Lenovo V-seeria                             → seeria "V Series", mudel "V330-14IKB" (pealkiri "Lenovo V330-14IKB")
 *   3. tundmatu seeria: tootja ja mudel on korras → seeria = mudelinime esimene sõna, mudel = kogu nimi, HOIATUS
 *      (parem õige uus mudel kui toode poest väljas; fuzzy-vastet olemasoleva mudeliga ei tehta)
 * Tühi mudel või tundmatu tootja → ModelResolutionError.
 */
export function resolveModelRef(manufacturer: string, modelName: string): ModelRef {
  const brand = parseBrand(manufacturer);
  if (!brand) throw new ModelResolutionError(`Tundmatu tootja: ${manufacturer.trim()}`);
  const name = modelName.replace(/\s+/g, " ").trim();
  if (!name) throw new ModelResolutionError("Mudel puudub");
  let taxonomyWarning: string | null = null;
  let names = splitSeries(name);
  if (!names && brand === "lenovo" && LENOVO_V_SERIES.test(name)) names = { series: "V Series", model: name };
  if (!names) {
    const series = name.split(" ")[0];
    names = { series, model: name };
    taxonomyWarning = `Tundmatu seeria, kasutati "${series}": ${BRAND_NAMES[brand]} ${name}`;
  }
  const model = canonicalModelName(names.series, names.model);
  const title = productTitle(BRAND_NAMES[brand], names.series, model);
  return {
    taxonomyWarning,
    brand,
    series: names.series,
    model,
    generation: model.match(/\b(Gen \d+|G\d{1,2})\b/i)?.[1] ?? null,
    slug: slugify(title),
    title,
  };
}

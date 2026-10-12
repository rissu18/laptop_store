/**
 * Tootepildid.
 *
 * Pildid kuuluvad MUDELILE (ProductModel, nt "Lenovo ThinkPad T14 Gen 3"), mitte konkreetsele
 * tarnija pakkumisele — kõik sama mudeli konfiguratsioonid kasutavad samu pilte.
 * Erand: tulevikus `ACTUAL_UNIT` pildid konkreetsest ühikust.
 */

/** ICECAT = alla laaditud meie salvestusse; LAPTOPID = Laptopid.ee tootepildid mudeli tasemel (kaug-URL, enrich:catalog) */
export const IMAGE_SOURCES = ["ICECAT", "LAPTOPID", "MANUAL", "SUPPLIER", "PLACEHOLDER"] as const;
export type ImageSource = (typeof IMAGE_SOURCES)[number];

export const IMAGE_TYPES = ["MODEL_GENERIC", "ACTUAL_UNIT", "PLACEHOLDER"] as const;
/** MODEL_GENERIC = tootja/Icecati mudelipilt (illustratiivne); ACTUAL_UNIT = pilt müüdavast seadmest */
export type ImageType = (typeof IMAGE_TYPES)[number];

export const IMAGE_VARIANTS = ["thumbnail", "medium", "large"] as const;
export type ImageVariant = (typeof IMAGE_VARIANTS)[number];

/** Andmebaasi kirje (Phase 2: tabel ProductImage). Sisaldab ka sisemisi välju. */
export interface ProductImageRecord {
  id: string;
  productModelId: string;
  source: ImageSource;
  /** Allika ID, nt Icecati galerii pildi ID — uuendamiseks ja duplikaatide vältimiseks */
  sourceId: string;
  type: ImageType;
  position: number;
  isMain: boolean;
  /** Meie salvestusruumi URL-id — frontend kasutab AINULT neid */
  thumbnailUrl: string;
  mediumUrl: string;
  largeUrl: string;
  /** Large variandi mõõdud */
  width: number;
  height: number;
  alt: string;
  originalSourceUrl: string;
  /** Allika muutmise aeg (Icecati `Updated`) — kui see pole muutunud, pilti uuesti alla ei laadita */
  sourceUpdatedAt: string | null;
  downloadedAt: string;
  /** Salvestusruumi võtmed (thumbnail, medium, large) — vana pildi kustutamiseks */
  storageKeys: string[];
  /** Allikafaili SHA-256 — täpselt sama sisuga pildid eemaldatakse galeriist */
  contentHash: string | null;
  /**
   * Admin on pildi peitnud (nt eksitav klaviatuuri lähivõte). Peidetud pilti ei kuvata,
   * aga kirje jääb alles, et import seda tagasi ei tooks.
   */
  isHidden: boolean;
}

/** Kuvatavad pildikirjed: peidetud välja, järjekord säilib. */
export function visibleImages(records: ProductImageRecord[]): ProductImageRecord[] {
  return records.filter((record) => !record.isHidden).sort((a, b) => a.position - b.position);
}

/** Avalik kuju, mis jõuab brauserisse. */
export interface ProductImageView {
  thumbnailUrl: string;
  mediumUrl: string;
  largeUrl: string;
  width: number;
  height: number;
  alt: string;
  type: ImageType;
}

export function toImageView(record: ProductImageRecord): ProductImageView {
  return {
    thumbnailUrl: record.thumbnailUrl,
    mediumUrl: record.mediumUrl,
    largeUrl: record.largeUrl,
    width: record.width,
    height: record.height,
    alt: record.alt,
    type: record.type,
  };
}

/**
 * Kuvatavad pildid: konkreetse seadme fotod (kui on), muidu mudeli pildid.
 * Tühi massiiv → frontend näitab placeholderit.
 */
export function imagesForDisplay(item: { product: { images: ProductImageView[] }; variant: { images: ProductImageView[] } }): ProductImageView[] {
  return item.variant.images.length > 0 ? item.variant.images : item.product.images;
}

/** MODEL_GENERIC piltide juures kuvatav märge (Icecati pilt võib erineda müüdavast seadmest, nt klaviatuur). */
export const ILLUSTRATIVE_IMAGES_NOTICE =
  "Tootepildid on illustratiivsed. Seadme tegelik konfiguratsioon ja kosmeetiline seisukord vastavad tootekirjelduses märgitule.";

/** Kas pildi juurde tuleb kuvada "illustratiivne" märge. */
export function isIllustrative(image: Pick<ProductImageView, "type">): boolean {
  return image.type !== "ACTUAL_UNIT";
}

/**
 * Alt-tekst mudeli päris andmetest. Icecat ei ütle, mis nurga alt pilt on tehtud,
 * seega vaadet ("külgvaade") ei leiutata — kasutatakse järjekorranumbrit.
 */
export function buildAltText(modelTitle: string, position: number): string {
  return position === 0 ? `${modelTitle} sülearvuti` : `${modelTitle} sülearvuti – pilt ${position + 1}`;
}

/**
 * Stabiilne, SEO-sõbralik failinimi: lenovo-thinkpad-t14-gen-3-01-thumb.webp
 * `uniqueId` lisatakse ainult siis, kui sama nimi on juba teise pildi poolt kasutusel.
 */
export function buildImageFileName(modelSlug: string, position: number, variant: ImageVariant, uniqueId?: string): string {
  const suffix = variant === "thumbnail" ? "thumb" : variant;
  const unique = uniqueId ? `-${uniqueId.toLowerCase().replace(/[^a-z0-9]/g, "")}` : "";
  return `${modelSlug}-${String(position + 1).padStart(2, "0")}${unique}-${suffix}.webp`;
}

/**
 * Tootekaardi pilt brauserile saatmiseks: ainult URL-id, mida kaart päriselt kasutab (vt StoredImage).
 *   - tarnija kaugpilt (https://…) → ainult `largeUrl` (Next/Image teeb sobiva laiuse ise);
 *   - meie salvestatud pilt → `thumbnailUrl` + `mediumUrl` (kaardi srcset ilma suure failita).
 * Kasutamata URL = "" — kaardi pildisirvija props'id (kuni ~12 pilti × 24 kaarti) jäävad ~3× väiksemaks.
 */
export function cardImageView(image: ProductImageView): ProductImageView {
  return /^https:\/\//.test(image.largeUrl)
    ? { ...image, thumbnailUrl: "", mediumUrl: "" }
    : { ...image, largeUrl: "" };
}

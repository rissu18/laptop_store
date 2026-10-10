import type { ImageVariant } from "@/domain/images/product-image";
import type { IcecatGalleryItem, IcecatProduct } from "./icecat-types";

/**
 * Icecati vastusest → meie pildid (põhipilt + galerii), igaühel allikakandidaadid
 * kolme variandi jaoks. Duplikaadid eemaldatakse Icecati pildi ID ja URL-i järgi.
 *
 * Variandi allika prioriteedid (spetsifikatsioonist):
 *   thumbnail: LowPic → Pic500x500 → HighPic → ThumbPic
 *   medium:    Pic500x500 → HighPic → LowPic
 *   large:     HighPic / galerii originaal (Pic) → Pic500x500
 * Kandidaat valitakse prioriteedi järjest, AGA jäetakse vahele, kui see on sihtsuurusest väiksem
 * ja leidub suurem (nt LowPic on Icecatis 200 px — Retina tootekaardi jaoks liiga väike).
 * Pilti ei suurendata kunagi üle originaali.
 */

export interface ImageSourceCandidate {
  url: string;
  width: number | null;
  height: number | null;
}

export interface ResolvedIcecatImage {
  sourceId: string;
  position: number;
  isMain: boolean;
  updatedAt: string | null;
  candidates: Record<ImageVariant, ImageSourceCandidate[]>;
}

/**
 * Variandi soovitud minimaalne laius pikslites. Medium on 700, et tootekaart oleks Retina
 * ekraanil (2× tihedus, kaart ~330 px) terav — Pic500x500 jääb selleks pisut väikeseks.
 */
export const VARIANT_TARGET_WIDTH: Record<ImageVariant, number> = {
  thumbnail: 300,
  medium: 700,
  large: 1000,
};

const MAX_GALLERY_IMAGES = 12;
/** Põhipildiks sobiva pildi minimaalne laius */
const MIN_MAIN_WIDTH = 500;

function candidate(url: string | undefined, width?: number, height?: number): ImageSourceCandidate | null {
  return url ? { url, width: width ?? null, height: height ?? null } : null;
}

function compact(list: (ImageSourceCandidate | null)[]): ImageSourceCandidate[] {
  const seen = new Set<string>();
  return list.filter((c): c is ImageSourceCandidate => c !== null && !seen.has(c.url) && Boolean(seen.add(c.url)));
}

function fromGalleryItem(item: IcecatGalleryItem) {
  const low = candidate(item.LowPic, item.LowWidth, item.LowHeight);
  const medium = candidate(item.Pic500x500, item.Pic500x500Width, item.Pic500x500Height);
  const high = candidate(item.Pic, item.PicWidth, item.PicHeight);
  const thumb = candidate(item.ThumbPic, 75, 75);
  return {
    thumbnail: compact([low, medium, high, thumb]),
    medium: compact([medium, high, low]),
    large: compact([high, medium]),
  };
}

function fromMainImage(image: NonNullable<IcecatProduct["Image"]>) {
  const low = candidate(image.LowPic, image.LowPicWidth, image.LowPicHeight);
  const medium = candidate(image.Pic500x500, image.Pic500x500Width, image.Pic500x500Height);
  const high = candidate(image.HighPic, image.HighPicWidth, image.HighPicHeight);
  const thumb = candidate(image.ThumbPic, 75, 75);
  return {
    thumbnail: compact([low, medium, high, thumb]),
    medium: compact([medium, high, low]),
    large: compact([high, medium]),
  };
}

/**
 * Jätab välja failid, mis teadaolevate mõõtude järgi ei ole tootefotod
 * (nt 500×49 logoriba või väga kitsas bänner). Mõõtudeta pildid lastakse edasi —
 * need kontrollitakse pärast allalaadimist.
 */
function looksLikeProductPhoto(candidates: Record<ImageVariant, ImageSourceCandidate[]>): boolean {
  const largest = candidates.large[0] ?? candidates.medium[0];
  if (!largest?.width || !largest.height) return true;
  const ratio = largest.width / largest.height;
  return Math.min(largest.width, largest.height) >= 100 && ratio <= 4 && ratio >= 0.25;
}

/** Pildi "identiteet" duplikaatide tuvastamiseks: suurima versiooni URL ilma päringuparameetriteta. */
function identityUrl(candidates: Record<ImageVariant, ImageSourceCandidate[]>): string | null {
  const url = candidates.large[0]?.url ?? candidates.medium[0]?.url ?? candidates.thumbnail[0]?.url;
  return url ? url.split("?")[0].toLowerCase() : null;
}

export function resolveIcecatImages(product: IcecatProduct): ResolvedIcecatImage[] {
  const gallery = [...(product.Gallery ?? [])]
    // Ainult avalikud tootepildid (mitte nt privaatsed või muud tüüpi failid)
    .filter((item) => item.IsPrivate !== "1" && (!item.Type || item.Type === "ProductImage"))
    .sort((a, b) => (a.No ?? 999) - (b.No ?? 999));

  const images: ResolvedIcecatImage[] = [];
  const seenIds = new Set<string>();
  const seenUrls = new Set<string>();

  const add = (sourceId: string, candidates: ResolvedIcecatImage["candidates"], updatedAt: string | null) => {
    const identity = identityUrl(candidates);
    if (!identity || seenIds.has(sourceId) || seenUrls.has(identity)) return;
    if (!looksLikeProductPhoto(candidates)) return;
    seenIds.add(sourceId);
    seenUrls.add(identity);
    images.push({ sourceId, position: images.length, isMain: images.length === 0, updatedAt, candidates });
  };

  // 1. Põhipilt, prioriteet:
  //    Icecati ametlik HighPic → esimene hea resolutsiooniga galeriipilt → Pic500x500 → LowPic
  //    (kui sama pilt on ka galeriis, kasutame galerii ID-d ja `Updated` aega)
  const image = product.Image;
  const mainGallery = gallery.find((item) => item.IsMain === "Y");
  const officialHigh = image?.HighPic && (image.HighPicWidth ?? MIN_MAIN_WIDTH) >= MIN_MAIN_WIDTH;
  const goodGallery = gallery.find((item) => item.Pic && (item.PicWidth ?? 0) >= MIN_MAIN_WIDTH);
  const mainFromImage = (img: NonNullable<IcecatProduct["Image"]>) => {
    const sameAsGallery = gallery.find((item) => item.Pic && item.Pic === img.HighPic) ?? mainGallery;
    add(sameAsGallery?.ID ?? "main", fromMainImage(img), sameAsGallery?.Updated ?? null);
  };
  if (image && officialHigh) mainFromImage(image);
  else if (goodGallery) add(goodGallery.ID, fromGalleryItem(goodGallery), goodGallery.Updated ?? null);
  else if (image && (image.Pic500x500 || image.LowPic)) mainFromImage(image);

  // 2. Galerii Icecati järjekorras
  for (const item of gallery) {
    if (images.length >= MAX_GALLERY_IMAGES) break;
    add(item.ID, fromGalleryItem(item), item.Updated ?? null);
  }

  return images;
}

/**
 * Valib variandi jaoks allika: esimene prioriteedi järgi, mis on vähemalt sihtsuuruses;
 * kui ükski pole piisavalt suur, siis suurim olemasolev (ilma suurendamata).
 */
export function selectSource(candidates: ImageSourceCandidate[], variant: ImageVariant): ImageSourceCandidate | null {
  if (candidates.length === 0) return null;
  const target = VARIANT_TARGET_WIDTH[variant];
  const bigEnough = candidates.find((c) => c.width === null || c.width >= target);
  if (bigEnough) return bigEnough;
  return [...candidates].sort((a, b) => (b.width ?? 0) - (a.width ?? 0))[0];
}

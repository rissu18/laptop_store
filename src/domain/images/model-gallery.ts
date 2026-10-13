import type { ProductImageView } from "./product-image";

/**
 * Mudeli KOONDGALERII — üks galerii mudeli (ProductModel) kohta, mida kasutavad kõik selle mudeli konfiguratsioonid
 * (tooteleht, tootekaart, ostukorv, kassa). Galerii ei sõltu sellest, millise tarnija pakkumine on avatud.
 *
 * Allikad (kõik sama mudeli pildid liidetakse):
 *   - `product_images` (mudeli pildid: admin MANUAL / ACTUAL_UNIT, Laptopid.ee koopiad LAPTOPID, SUPPLIER, Icecat ICECAT)
 *   - `listing_images` sama mudeli KÕIGIST müügis pakkumistest (Laptopid.ee fotod, tulevikus teiste tarnijate fotod)
 *
 * Järjekord (GALLERY_GROUP_PRIORITY): päris fotod ees, stock/illustratiivsed lõpus:
 *   1. OWN       — poe enda / admini lisatud pildid (MANUAL, ACTUAL_UNIT)
 *   2. LAPTOPID  — Laptopid.ee fotod (sama ettevõtte salongi päris fotod)
 *   3. SUPPLIER  — teiste tarnijate / hulgiladude fotod
 *   4. ICECAT    — tootja stock-pildid
 *   5. PLACEHOLDER — ainult siis, kui muud pole
 * Grupi sees: allika järjekord (position), Laptopid.ee pakkumised deterministlikult (rohkem fotosid → SKU).
 *
 * Duplikaadid: sama URL (päringuparameetriteta) või visuaalselt sama pilt (`visual_hash`, dHash, ≤ 4 erinevat bitti
 * 64-st; Laptopid.ee koopiad Icecati fotodest on 0–2, sama nurk teise ekraanipildiga 5+) — alles jääb esimene.
 *
 * Tühjad pildid (reeglid, `npm run images:analyze`):
 *   - BROKEN: pilti ei saa laadida (HTTP viga / pole pildifail) → ei kuvata kunagi
 *   - BLANK: peaaegu tühi kaader — valgel taustal on alla 2% nähtavaid piksleid (nt juuksepeenike külgprofiil) või
 *     pilt on ühtlane (heleduse standardhälve < 3)
 *   - PLACEHOLDER tüüp/allikas
 *   BLANK ja PLACEHOLDER jäetakse välja, kui mudelil on vähemalt üks sisukas pilt; muidu jäävad viimaseks varuks.
 * Pildi arvu piirangut pole (sama mudeli koondgalerii võib olla üle 10 pildi).
 */

export const GALLERY_GROUP_PRIORITY = ["OWN", "LAPTOPID", "SUPPLIER", "ICECAT", "PLACEHOLDER"] as const;
export type GalleryGroup = (typeof GALLERY_GROUP_PRIORITY)[number];

export type ImageQuality = "OK" | "BLANK" | "BROKEN";

/** Visuaalse räsi lävi: nii palju erinevaid bitte 64-st loetakse samaks pildiks */
export const GALLERY_DUPLICATE_DISTANCE = 4;

export interface GalleryCandidate {
  view: ProductImageView;
  group: GalleryGroup;
  /** Järjestusvõti grupi sees (väiksem ette), nt [allika järjekord, pakkumise järjekord, position] */
  order: number[];
  /** dHash 16 hex-märgina; NULL = analüüsimata (siis ainult URL-i järgi) */
  visualHash: string | null;
  quality: ImageQuality | null;
}

/** Mudeli pildi allikas (product_images.source / type) → galerii grupp */
export function groupForModelImage(source: string, type: string): GalleryGroup {
  if (type === "PLACEHOLDER" || source === "PLACEHOLDER") return "PLACEHOLDER";
  if (source === "MANUAL" || type === "ACTUAL_UNIT") return "OWN";
  if (source === "LAPTOPID") return "LAPTOPID";
  if (source === "ICECAT") return "ICECAT";
  return "SUPPLIER";
}

/** Pakkumise pilt (listing_images) → galerii grupp tarnija järgi */
export function groupForListingImage(supplier: string): GalleryGroup {
  return supplier === "laptopid" ? "LAPTOPID" : "SUPPLIER";
}

function urlKey(url: string): string {
  return url.split("?")[0].replace(/\/+/g, "/").toLowerCase();
}

/** Pildi identiteedi URL: suurim olemasolev versioon (kaug-URL-ide puhul Laptopid.ee "original") */
function identityUrl(view: ProductImageView): string {
  return urlKey(view.largeUrl || view.mediumUrl || view.thumbnailUrl);
}

export function hexHashDistance(a: string, b: string): number {
  if (a.length !== b.length) return 64;
  let diff = BigInt(`0x${a}`) ^ BigInt(`0x${b}`);
  let count = 0;
  while (diff > BigInt(0)) {
    count += Number(diff & BigInt(1));
    diff >>= BigInt(1);
  }
  return count;
}

function compareOrder(a: number[], b: number[]): number {
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const d = (a[i] ?? 0) - (b[i] ?? 0);
    if (d !== 0) return d;
  }
  return 0;
}

/** Koondgalerii: deterministlik (sama sisend → sama järjekord), prioriteet → dedupe → tühjade eemaldus */
export function buildModelGallery(candidates: GalleryCandidate[]): ProductImageView[] {
  const groupRank = (g: GalleryGroup) => GALLERY_GROUP_PRIORITY.indexOf(g);
  const sorted = candidates
    .filter((c) => c.quality !== "BROKEN")
    .map((c, index) => ({ c, index }))
    .sort((x, y) => groupRank(x.c.group) - groupRank(y.c.group) || compareOrder(x.c.order, y.c.order) || x.index - y.index)
    .map(({ c }) => c);

  const kept: GalleryCandidate[] = [];
  const seenUrls = new Set<string>();
  for (const candidate of sorted) {
    const url = identityUrl(candidate.view);
    if (seenUrls.has(url)) continue;
    const hash = candidate.visualHash;
    if (hash && kept.some((k) => k.visualHash && hexHashDistance(k.visualHash, hash) <= GALLERY_DUPLICATE_DISTANCE)) continue;
    seenUrls.add(url);
    kept.push(candidate);
  }

  const weak = (c: GalleryCandidate) => c.group === "PLACEHOLDER" || c.quality === "BLANK";
  const hasContent = kept.some((c) => !weak(c));
  // Sisukad pildid ees; tühjad/varupildid ainult siis, kui muud pole (ja siis viimasena)
  const result = hasContent ? kept.filter((c) => !weak(c)) : [...kept.filter((c) => c.group !== "PLACEHOLDER"), ...kept.filter((c) => c.group === "PLACEHOLDER")];
  return result.map((c) => c.view);
}

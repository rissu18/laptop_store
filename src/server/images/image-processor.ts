import sharp, { type Metadata } from "sharp";
import type { ImageVariant } from "@/domain/images/product-image";

/**
 * Pildi kontroll ja variantide genereerimine serveris (sharp).
 *
 * - Faili tüüp tuvastatakse SISU järgi (magic bytes + dekodeerimine), mitte laiendi ega päise järgi.
 * - Pilti ei suurendata kunagi (withoutEnlargement).
 * - Sülearvutit ei lõigata (fit: contain / inside) — nurgad, ekraan ja klaviatuur jäävad kaadrisse.
 */

export const ALLOWED_CONTENT_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;
export const MAX_SOURCE_BYTES = 15 * 1024 * 1024;
export const MIN_SOURCE_DIMENSION = 100;

export class ImageValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ImageValidationError";
  }
}

/** Tuvastab formaadi esimeste baitide järgi. */
export function sniffImageType(buffer: Buffer): (typeof ALLOWED_CONTENT_TYPES)[number] | null {
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return "image/jpeg";
  if (buffer.length >= 8 && buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "image/png";
  if (buffer.length >= 12 && buffer.toString("ascii", 0, 4) === "RIFF" && buffer.toString("ascii", 8, 12) === "WEBP") return "image/webp";
  return null;
}

export interface InspectedImage {
  contentType: (typeof ALLOWED_CONTENT_TYPES)[number];
  width: number;
  height: number;
  bytes: number;
  hasAlpha: boolean;
}

export async function inspectImage(buffer: Buffer, declaredContentType: string | null): Promise<InspectedImage> {
  if (buffer.length === 0) throw new ImageValidationError("Tühi fail");
  if (buffer.length > MAX_SOURCE_BYTES) throw new ImageValidationError(`Fail on liiga suur (${buffer.length} baiti)`);

  const declared = declaredContentType?.split(";")[0].trim().toLowerCase() ?? "";
  if (declared && !(ALLOWED_CONTENT_TYPES as readonly string[]).includes(declared)) {
    throw new ImageValidationError(`Lubamatu Content-Type: ${declared}`);
  }
  const sniffed = sniffImageType(buffer);
  if (!sniffed) throw new ImageValidationError("Fail ei ole JPEG, PNG ega WebP pilt");

  let metadata: Metadata;
  try {
    metadata = await sharp(buffer).metadata();
  } catch {
    throw new ImageValidationError("Pilti ei õnnestunud dekodeerida");
  }
  const { width, height } = metadata;
  if (!width || !height) throw new ImageValidationError("Pildi mõõdud puuduvad");
  if (width < MIN_SOURCE_DIMENSION || height < MIN_SOURCE_DIMENSION) {
    throw new ImageValidationError(`Pilt on liiga väike (${width}×${height})`);
  }
  return { contentType: sniffed, width, height, bytes: buffer.length, hasAlpha: Boolean(metadata.hasAlpha) };
}

export const VARIANT_SPECS: Record<ImageVariant, { maxSize: number; quality: number; square: boolean }> = {
  // Tootekaart: ruudukujuline lõuend, et kaartide pildiala oleks ühtlane
  thumbnail: { maxSize: 300, quality: 82, square: true },
  medium: { maxSize: 700, quality: 82, square: false },
  // Tooteleht: hea kvaliteet; 4000 px originaal vähendatakse mõistlikule suurusele
  // Tooteleht + täisekraan (galerii ~690 px, 2× tihedus): 4000 px originaal → 1600 px. Failid on Git-is
  // (public/media/products), seega mõõdukas suurus hoiab repo ja deploy väiksena.
  large: { maxSize: 1600, quality: 84, square: false },
};

export interface ProcessedImage {
  data: Buffer;
  contentType: "image/webp";
  width: number;
  height: number;
}

export async function renderVariant(buffer: Buffer, variant: ImageVariant, hasAlpha: boolean): Promise<ProcessedImage> {
  const spec = VARIANT_SPECS[variant];
  // Läbipaistvus säilib, kui originaalil see on; muidu valge taust
  const background = hasAlpha ? { r: 255, g: 255, b: 255, alpha: 0 } : { r: 255, g: 255, b: 255, alpha: 1 };

  const pipeline = sharp(buffer)
    .rotate() // EXIF orientatsioon
    .resize({
      width: spec.maxSize,
      height: spec.maxSize,
      fit: spec.square ? "contain" : "inside",
      background,
      withoutEnlargement: true,
    })
    .webp({ quality: spec.quality, alphaQuality: 90, effort: 5 });

  const { data, info } = await pipeline.toBuffer({ resolveWithObject: true });
  return { data, contentType: "image/webp", width: info.width, height: info.height };
}

/**
 * Visuaalne räsi (dHash, 64 bitti) duplikaatide tuvastamiseks: sama foto eri suuruses / eri pakkimisega / valge
 * äärisega (Icecati 1200×1200 vs 1000×750) annab peaaegu sama räsi. Ääred kärbitakse enne võrdlemist.
 */
export async function visualHash(buffer: Buffer): Promise<bigint | null> {
  const base = () => sharp(buffer).rotate().flatten({ background: "#ffffff" });
  let image = base();
  try {
    image = sharp(await base().trim({ background: "#ffffff", threshold: 12 }).toBuffer());
  } catch {
    // ühtlase taustaga pilt — kärpida pole midagi
  }
  const { data } = await image.greyscale().resize(9, 8, { fit: "fill" }).raw().toBuffer({ resolveWithObject: true });
  let hash = BigInt(0);
  for (let y = 0; y < 8; y++) {
    for (let x = 0; x < 8; x++) {
      hash = (hash << BigInt(1)) | (data[y * 9 + x] > data[y * 9 + x + 1] ? BigInt(1) : BigInt(0));
    }
  }
  // Ühtlane pilt (kõik bitid 0) ei anna visuaalset allkirja — seda võrreldakse ainult faili sisu järgi
  return hash === BigInt(0) ? null : hash;
}

/** Erinevate bittide arv; ≤ VISUAL_DUPLICATE_DISTANCE → sama pilt */
export function hashDistance(a: bigint, b: bigint): number {
  let diff = a ^ b;
  let count = 0;
  while (diff > BigInt(0)) {
    count += Number(diff & BigInt(1));
    diff >>= BigInt(1);
  }
  return count;
}

export const VISUAL_DUPLICATE_DISTANCE = 4;

/** BLANK reegel: valgel taustal alla 2% nähtavaid (heledus < 200) piksleid või ühtlane pilt (standardhälve < 3) */
export const BLANK_INK_RATIO = 0.02;
export const BLANK_MIN_STDEV = 3;

export interface ImageAnalysis {
  /** dHash 16 hex-märgina; ühtlase pildi puhul null */
  visualHash: string | null;
  quality: "OK" | "BLANK";
  inkRatio: number;
  stdev: number;
}

/** Galerii jaoks: visuaalne räsi + "peaaegu tühi kaader" (läbipaistvus → valge, nagu brauser seda kuvab) */
export async function analyzeImage(buffer: Buffer): Promise<ImageAnalysis> {
  const flat = await sharp(buffer).rotate().flatten({ background: "#ffffff" }).resize(400, 400, { fit: "inside", withoutEnlargement: true }).png().toBuffer();
  const { data, info } = await sharp(flat).greyscale().raw().toBuffer({ resolveWithObject: true });
  let ink = 0;
  let sum = 0;
  let sumSq = 0;
  for (const v of data) {
    if (v < 200) ink++;
    sum += v;
    sumSq += v * v;
  }
  const n = info.width * info.height;
  const mean = sum / n;
  const stdev = Math.sqrt(Math.max(0, sumSq / n - mean * mean));
  const inkRatio = ink / n;
  const hash = await visualHash(flat);
  return {
    visualHash: hash === null ? null : hash.toString(16).padStart(16, "0"),
    quality: inkRatio < BLANK_INK_RATIO || stdev < BLANK_MIN_STDEV ? "BLANK" : "OK",
    inkRatio,
    stdev,
  };
}

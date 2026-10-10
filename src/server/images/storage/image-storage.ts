import type { ImageVariant } from "@/domain/images/product-image";

/**
 * Piltide salvestusruum.
 *
 * Pipeline laeb pildi Icecatist alla, kontrollib ja töötleb selle (thumbnail/medium/large)
 * ning annab adapterile valmis baidid. Seega adapter ei pea pilditöötlusest midagi teadma —
 * uue salvestusteenuse lisamiseks piisab ühest klassist.
 *
 * Implementatsioonid:
 * - LocalImageStorageAdapter — arendus ja testid (kirjutab `public/media` kausta)
 * - S3CompatibleImageStorageAdapter — TULEVIKUS: Cloudflare R2 / Backblaze B2 / muu S3-ühilduv teenus
 *
 * NB! Vercelis ei ole failisüsteem püsiv, seega productionis LocalImageStorageAdapter'it kasutada ei saa.
 */
export interface ImageStorageAdapter {
  readonly name: string;
  saveImage(input: SaveImageInput): Promise<StoredImage>;
  deleteImage(key: string): Promise<void>;
}

export interface SaveImageInput {
  productModelId: string;
  variant: ImageVariant;
  /** Stabiilne SEO-sõbralik nimi, nt lenovo-thinkpad-t14-gen-3-01-thumb.webp */
  fileName: string;
  data: Buffer;
  contentType: string;
}

export interface StoredImage {
  /** Avalik URL, mida frontend kasutab */
  url: string;
  /** Salvestusruumi võti kustutamiseks/uuendamiseks */
  key: string;
  bytes: number;
}

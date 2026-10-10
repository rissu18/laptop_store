import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import type { ImageStorageAdapter, SaveImageInput, StoredImage } from "./image-storage";

/**
 * Arenduse salvestusruum: kirjutab failid `public/media/products/<mudel>/` kausta,
 * kust Next.js neid otse serveerib (`/media/products/...`).
 *
 * Kasutada AINULT arenduses ja testides — Verceli runtime failisüsteem ei ole püsiv.
 */
const SAFE_SEGMENT = /^[a-z0-9][a-z0-9-]*(\.webp)?$/;

export class LocalImageStorageAdapter implements ImageStorageAdapter {
  readonly name = "local";

  constructor(
    private readonly rootDir = path.join(process.cwd(), "public", "media", "products"),
    private readonly publicBaseUrl = "/media/products",
  ) {}

  private resolve(productModelId: string, fileName: string): { filePath: string; key: string } {
    // Kaitse path traversal'i vastu: lubatud ainult lihtsad slug'id ja failinimed
    if (!SAFE_SEGMENT.test(productModelId) || !SAFE_SEGMENT.test(fileName)) {
      throw new Error(`Lubamatu failitee: ${productModelId}/${fileName}`);
    }
    const key = `${productModelId}/${fileName}`;
    return { filePath: path.join(this.rootDir, productModelId, fileName), key };
  }

  async saveImage(input: SaveImageInput): Promise<StoredImage> {
    const { filePath, key } = this.resolve(input.productModelId, input.fileName);
    await mkdir(path.dirname(filePath), { recursive: true });
    await writeFile(filePath, input.data);
    return { url: `${this.publicBaseUrl}/${key}`, key, bytes: input.data.length };
  }

  async deleteImage(key: string): Promise<void> {
    const [productModelId, fileName] = key.split("/");
    const { filePath } = this.resolve(productModelId ?? "", fileName ?? "");
    await rm(filePath, { force: true });
  }
}

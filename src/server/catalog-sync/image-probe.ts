/**
 * Kaugpildi mõõdud ilma kogu faili alla laadimata: HTTP Range päring (esimesed baidid) + päise lugemine.
 * Laptopid.ee pildid on 0,4–2 MB PNG-d; mõõtude jaoks piisab ~30 baidist (PNG IHDR).
 * Mõõte kasutatakse <img width/height> jaoks (paigutus ei hüple). Ebaõnnestumine → null
 * (pilti sel korral ei lisata; järgmine sync proovib uuesti) — toode ise jääb korras.
 */

const PROBE_BYTES = 64 * 1024;

export function readImageSize(bytes: Uint8Array): { width: number; height: number } | null {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  // PNG: 89 50 4E 47 … IHDR (laius 16–19, kõrgus 20–23)
  if (bytes.length >= 24 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) {
    return valid(view.getUint32(16), view.getUint32(20));
  }
  // JPEG: SOFn marker
  if (bytes.length >= 4 && bytes[0] === 0xff && bytes[1] === 0xd8) {
    let offset = 2;
    while (offset + 9 < bytes.length) {
      if (bytes[offset] !== 0xff) return null;
      const marker = bytes[offset + 1];
      const length = view.getUint16(offset + 2);
      if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
        return valid(view.getUint16(offset + 7), view.getUint16(offset + 5));
      }
      offset += 2 + length;
    }
    return null;
  }
  // WebP: RIFF....WEBP
  if (bytes.length >= 30 && String.fromCharCode(...bytes.slice(0, 4)) === "RIFF" && String.fromCharCode(...bytes.slice(8, 12)) === "WEBP") {
    const chunk = String.fromCharCode(...bytes.slice(12, 16));
    if (chunk === "VP8X") return valid(1 + (bytes[24] | (bytes[25] << 8) | (bytes[26] << 16)), 1 + (bytes[27] | (bytes[28] << 8) | (bytes[29] << 16)));
    if (chunk === "VP8 ") return valid(view.getUint16(26, true) & 0x3fff, view.getUint16(28, true) & 0x3fff);
    if (chunk === "VP8L") {
      const b = view.getUint32(21, true);
      return valid((b & 0x3fff) + 1, ((b >> 14) & 0x3fff) + 1);
    }
  }
  return null;
}

function valid(width: number, height: number): { width: number; height: number } | null {
  return width > 0 && height > 0 && width <= 20_000 && height <= 20_000 ? { width, height } : null;
}

export type ImageSizeProbe = (url: string) => Promise<{ width: number; height: number } | null>;

export function createImageSizeProbe(fetchImpl: typeof fetch = fetch): ImageSizeProbe {
  return async (url) => {
    try {
      const response = await fetchImpl(url, { headers: { Range: `bytes=0-${PROBE_BYTES - 1}` }, signal: AbortSignal.timeout(10_000), redirect: "error" });
      if (response.status !== 200 && response.status !== 206) {
        await response.body?.cancel().catch(() => undefined);
        return null;
      }
      if (!response.headers.get("content-type")?.startsWith("image/")) {
        await response.body?.cancel().catch(() => undefined);
        return null;
      }
      // Kui server Range'i ei toeta (200), loetakse ainult esimesed PROBE_BYTES baiti
      const reader = response.body?.getReader();
      if (!reader) return null;
      const chunks: Uint8Array[] = [];
      let total = 0;
      while (total < PROBE_BYTES) {
        const { done, value } = await reader.read();
        if (done) break;
        chunks.push(value);
        total += value.length;
      }
      await reader.cancel().catch(() => undefined);
      const bytes = new Uint8Array(total);
      let offset = 0;
      for (const chunk of chunks) {
        bytes.set(chunk, offset);
        offset += chunk.length;
      }
      return readImageSize(bytes);
    } catch {
      return null;
    }
  };
}

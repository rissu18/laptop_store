import "server-only";
import { request } from "node:https";
import { gunzipSync, inflateSync, brotliDecompressSync } from "node:zlib";

/**
 * Minimaalne HTTPS GET Foxway jaoks (node:https + zlib), sõltumatu Next.js-i paigatud `fetch`-ist.
 *
 * Miks: Verceli route handleris läbib globaalne `fetch` Next.js-i vahemälukihi; esimesel tootmiskatsel (2026-10-12)
 * jäi Foxway vastuse keha seal lugemata (TimeoutError), kohalikult sama päring võttis < 0,5 s. Siin on päis
 * `Accept-Encoding: gzip` ja dekodeerimine meie kontrolli all ning ajapiir kehtib kogu päringule (ühendus + keha).
 */

export interface TransportResponse {
  status: number;
  /** Dekodeeritud keha (UTF-8) */
  body: string;
  /** Kompressitud baitide arv võrgus */
  wireBytes: number;
  contentEncoding: string | null;
}

export type FoxwayTransport = (url: string, headers: Record<string, string>, options: { timeoutMs: number; maxBytes: number }) => Promise<TransportResponse>;

export class TransportError extends Error {
  constructor(
    message: string,
    public readonly phase: "connect" | "body" | "decode" | "size",
  ) {
    super(message);
    this.name = "TransportError";
  }
}

export const httpsTransport: FoxwayTransport = (url, headers, { timeoutMs, maxBytes }) =>
  new Promise((resolve, reject) => {
    const started = Date.now();
    let phase: "connect" | "body" = "connect";
    const req = request(url, { method: "GET", headers, timeout: timeoutMs }, (res) => {
      phase = "body";
      const chunks: Buffer[] = [];
      let size = 0;
      res.on("data", (chunk: Buffer) => {
        size += chunk.length;
        if (size > maxBytes) {
          req.destroy(new TransportError("vastus on liiga suur", "size"));
          return;
        }
        chunks.push(chunk);
      });
      res.on("end", () => {
        clearTimeout(timer);
        const raw = Buffer.concat(chunks);
        const encoding = (res.headers["content-encoding"] ?? "").toString().toLowerCase() || null;
        try {
          const decoded = encoding === "gzip" ? gunzipSync(raw) : encoding === "deflate" ? inflateSync(raw) : encoding === "br" ? brotliDecompressSync(raw) : raw;
          resolve({ status: res.statusCode ?? 0, body: decoded.toString("utf8"), wireBytes: raw.length, contentEncoding: encoding });
        } catch {
          reject(new TransportError(`vastuse dekodeerimine ebaõnnestus (${encoding})`, "decode"));
        }
      });
      res.on("error", (error) => reject(error instanceof TransportError ? error : new TransportError(`keha lugemine katkes (${error.message})`, "body")));
    });
    // Üldine ajapiir kogu päringule (socket timeout katab ainult jõudeoleku)
    const timer = setTimeout(() => req.destroy(new TransportError(`aegus ${timeoutMs} ms järel (${phase === "connect" ? "ühendus/päised" : "keha"}, ${Date.now() - started} ms)`, phase)), timeoutMs);
    req.on("timeout", () => req.destroy(new TransportError(`jõudeolek üle ${timeoutMs} ms (${phase === "connect" ? "ühendus/päised" : "keha"})`, phase)));
    req.on("error", (error) => {
      clearTimeout(timer);
      reject(error instanceof TransportError ? error : new TransportError(error.message, phase));
    });
    req.end();
  });

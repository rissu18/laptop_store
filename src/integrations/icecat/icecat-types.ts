import { z } from "zod";

/**
 * Icecati JSON API vastuse osad, mida kasutame. Icecat tagastab numbrid stringidena ("4000"),
 * seega teisendame need. Tundmatud väljad jäetakse alles (passthrough), aga neid ei kasutata.
 * Dokumentatsioon: https://iceclog.com/manual-for-icecat-json-product-requests/
 */

const optionalUrl = z.string().optional().transform((v) => (v && /^https?:\/\//.test(v) ? v : undefined));
const optionalInt = z
  .union([z.string(), z.number()])
  .optional()
  .transform((v) => {
    const n = Number(v);
    return v !== undefined && v !== "" && Number.isFinite(n) && n > 0 ? Math.round(n) : undefined;
  });

export const icecatImageSchema = z
  .object({
    HighPic: optionalUrl,
    HighPicWidth: optionalInt,
    HighPicHeight: optionalInt,
    LowPic: optionalUrl,
    LowPicWidth: optionalInt,
    LowPicHeight: optionalInt,
    Pic500x500: optionalUrl,
    Pic500x500Width: optionalInt,
    Pic500x500Height: optionalInt,
    ThumbPic: optionalUrl,
  })
  .passthrough();

export const icecatGalleryItemSchema = z
  .object({
    ID: z.union([z.string(), z.number()]).transform(String),
    Pic: optionalUrl,
    PicWidth: optionalInt,
    PicHeight: optionalInt,
    LowPic: optionalUrl,
    LowWidth: optionalInt,
    LowHeight: optionalInt,
    Pic500x500: optionalUrl,
    Pic500x500Width: optionalInt,
    Pic500x500Height: optionalInt,
    ThumbPic: optionalUrl,
    No: optionalInt,
    IsMain: z.string().optional(),
    Updated: z.string().optional(),
    IsPrivate: z.union([z.string(), z.number()]).optional().transform((v) => String(v ?? "0")),
    Type: z.string().optional(),
  })
  .passthrough();

export const icecatProductSchema = z
  .object({
    GeneralInfo: z
      .object({
        IcecatId: z.union([z.string(), z.number()]).transform(String),
        Title: z.string().optional().default(""),
        Brand: z.string().optional().default(""),
        ProductName: z.string().optional().default(""),
        BrandPartCode: z.string().optional().default(""),
        GTIN: z.array(z.string()).optional().default([]),
        ProductFamily: z.unknown().optional(),
        ProductSeries: z.unknown().optional(),
      })
      .passthrough(),
    Image: icecatImageSchema.optional(),
    Gallery: z.array(icecatGalleryItemSchema).optional().default([]),
  })
  .passthrough();

export type IcecatImage = z.infer<typeof icecatImageSchema>;
export type IcecatGalleryItem = z.infer<typeof icecatGalleryItemSchema>;
export type IcecatProduct = z.infer<typeof icecatProductSchema>;

/** Toote identifikaator päringuks. Prioriteet: GTIN → MPN + Brand → Icecat ID. */
export type IcecatIdentifier =
  | { kind: "GTIN"; gtin: string }
  | { kind: "MPN"; brand: string; mpn: string }
  | { kind: "ICECAT_ID"; icecatId: string };

export function describeIdentifier(id: IcecatIdentifier): string {
  if (id.kind === "GTIN") return `GTIN ${id.gtin}`;
  if (id.kind === "MPN") return `MPN ${id.brand} ${id.mpn}`;
  return `Icecat ID ${id.icecatId}`;
}

export type IcecatLookupResult =
  | { status: "FOUND"; product: IcecatProduct }
  | { status: "NOT_FOUND"; message: string }
  | { status: "RESTRICTED"; message: string }
  | { status: "ERROR"; message: string };

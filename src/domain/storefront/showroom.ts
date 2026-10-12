import { COMPANY } from "@/config/company";
import type { StockInfo } from "@/domain/catalog/availability";

/**
 * Salongi (Tartu mnt 83) faktid poe brändiplokkide jaoks. Ainult tõestatavad väited:
 * aadress ja lahtiolekuaeg tulevad ettevõtte andmetest (src/config/company.ts), arv kataloogist.
 */

/**
 * Kas pakkumine on kohe saadaval (mitte partneri laos). Sama semantika mis poe laoseisu tekstil
 * (`stockLabel`): saadaval + täpne kogus teadmata → "Kohe saadaval" (Laptopid.ee — sama ettevõtte salong);
 * täpse kogusega pakkumised on partneri laos ("Partnerlaos N tk", tarne 1–2 tööpäeva).
 */
export function isImmediatelyAvailable(stock: StockInfo): boolean {
  return stock.available && stock.quantity === null;
}

/**
 * Ümardatud arv turundustekstiks: allapoole täissajani ("305" → "300+"), alla 100 täpne arv.
 * Allapoole ümardamine ei väida kunagi rohkem, kui kataloogis on. 0 → null (väidet ei kuvata).
 */
export function roundedCountLabel(count: number): string | null {
  if (count <= 0) return null;
  if (count < 100) return String(count);
  return `${Math.floor(count / 100) * 100}+`;
}

export const SHOWROOM = {
  street: COMPANY.address.street,
  city: COMPANY.address.city,
  /** "Tartu mnt 83, Tallinn" */
  addressShort: `${COMPANY.address.street}, ${COMPANY.address.city}`,
  /** "E–R 10:00–18:00" */
  hours: COMPANY.openingHours[0],
  mapsUrl: COMPANY.mapsUrl,
  contactHref: "/info/kontakt",
} as const;

/** Avalehe hero tegevused: kataloog, olemasolev leidja ja avalehe salongiplokk (#salong). */
export const HERO_CTAS = {
  primary: { href: "/sulearvutid", label: "Vaata sülearvuteid" },
  finder: { href: "/leia-sobiv", label: "Leia mulle sobiv" },
  showroom: { href: "#salong", label: "Vaata salongi" },
} as const;

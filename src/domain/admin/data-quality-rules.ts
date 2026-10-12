import { normalizeKeyboard } from "@/domain/catalog/keyboard";

/**
 * Andmekvaliteedi kontrollid (admin → Andmekvaliteet). Iga kontroll on klikitav filter
 * vastavas nimekirjas (mudelid või konfiguratsioonid). Kontrollid arvestavad EFEKTIIVSEID väärtusi
 * (admini parandus ?? tarnija väärtus) — parandatud väli ei ole enam probleem.
 */
export const MODEL_ISSUES = {
  "no-images": { label: "Mudelid ilma pildita", description: "Pole mudelipilte (Icecat / Laptopid.ee) ega müügis pakkumise fotot — poes kuvatakse placeholder." },
  "images-review": { label: "Pildivaste vajab ülevaatust", description: "Rikastus leidis ebakindla Laptopid.ee vaste (nt 7310 vs 7310 Carbon) — pilte automaatselt ei lisatud." },
  "icecat-not-found": { label: "Icecat: ei leitud", description: "Icecatist ei leitud kindlat vastet." },
  "icecat-needs-review": { label: "Icecat: vajab ülevaatust", description: "Madala kindlusega vaste — vajab käsitsi kinnitamist." },
} as const;

export const LISTING_ISSUES = {
  "missing-cpu": { label: "Puudub protsessor", description: "Pakkumine ei jõua poodi." },
  "missing-cpu-gen": { label: "Puudub CPU põlvkond", description: "Põlvkonna filter ei leia seda pakkumist." },
  "missing-ram": { label: "Puudub RAM", description: "Pakkumine ei jõua poodi." },
  "missing-ssd": { label: "Puudub SSD", description: "Pakkumine ei jõua poodi." },
  "missing-grade": { label: "Puudub seisukord", description: "Pakkumine ei jõua poodi." },
  "unknown-keyboard": { label: "Tundmatu klaviatuur", description: "Tarnija ei andnud paigutust (või kood on tundmatu) — klaviatuuri filter ei leia seda pakkumist." },
  "missing-keyboard": { label: "Klaviatuur puudub (füüsiline)", description: "Tarnija teatas \"Missing Keyboard\" — kvaliteediprobleem, mitte paigutus (Foxway: blokeeritud)." },
  "missing-sale-price": { label: "Puudub müügihind", description: "Pakkumine ei jõua poodi." },
  "missing-stock": { label: "Puudub laoseis", description: "Laoseis on teadmata — pakkumine ei jõua poodi." },
} as const;

export type ModelIssue = keyof typeof MODEL_ISSUES;
export type ListingIssue = keyof typeof LISTING_ISSUES;

export const isModelIssue = (value: unknown): value is ModelIssue => typeof value === "string" && value in MODEL_ISSUES;
export const isListingIssue = (value: unknown): value is ListingIssue => typeof value === "string" && value in LISTING_ISSUES;

/** Tarnija toorväärtus ütleb, et klaviatuur PUUDUB ("Missing Keyboard") — see on puudus, mitte tundmatu paigutus. */
export function keyboardReportedMissing(listing: { rawData?: unknown; details?: unknown }): boolean {
  const raw = (listing.rawData as { foxway?: { keyboard?: unknown } } | null | undefined)?.foxway?.keyboard ?? (listing.details as { keyboardRaw?: unknown } | null | undefined)?.keyboardRaw;
  return typeof raw === "string" && normalizeKeyboard(raw).missing;
}

/** Efektiivsetest väärtustest leitud probleemid (detailvaate jaoks). */
export function listingIssuesOf(listing: {
  cpu: string | null;
  cpuGeneration: string | null;
  ramGb: number | null;
  storageGb: number | null;
  grade: string | null;
  keyboard: string | null;
  salePriceCents: number | null;
  stock: number | null;
  /** Tarnija saadavus ilma koguseta (nt Laptopid.ee) — siis puuduv kogus ei ole viga */
  available?: boolean | null;
  rawData?: unknown;
  details?: unknown;
}): ListingIssue[] {
  const issues: ListingIssue[] = [];
  if (!listing.cpu) issues.push("missing-cpu");
  if (!listing.cpuGeneration) issues.push("missing-cpu-gen");
  if (!listing.ramGb) issues.push("missing-ram");
  if (!listing.storageGb) issues.push("missing-ssd");
  if (!listing.grade) issues.push("missing-grade");
  if (!listing.keyboard) issues.push(keyboardReportedMissing(listing) ? "missing-keyboard" : "unknown-keyboard");
  if (listing.salePriceCents === null) issues.push("missing-sale-price");
  if (listing.stock === null && (listing.available ?? null) === null) issues.push("missing-stock");
  return issues;
}

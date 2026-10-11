/**
 * Andmekvaliteedi kontrollid (admin → Andmekvaliteet). Iga kontroll on klikitav filter
 * vastavas nimekirjas (mudelid või konfiguratsioonid). Kontrollid arvestavad EFEKTIIVSEID väärtusi
 * (admini parandus ?? tarnija väärtus) — parandatud väli ei ole enam probleem.
 */
export const MODEL_ISSUES = {
  "no-images": { label: "Mudelid ilma pildita", description: "Poes kuvatakse placeholder-pilt." },
  "icecat-not-found": { label: "Icecat: ei leitud", description: "Icecatist ei leitud kindlat vastet." },
  "icecat-needs-review": { label: "Icecat: vajab ülevaatust", description: "Madala kindlusega vaste — vajab käsitsi kinnitamist." },
} as const;

export const LISTING_ISSUES = {
  "missing-cpu": { label: "Puudub protsessor", description: "Pakkumine ei jõua poodi." },
  "missing-cpu-gen": { label: "Puudub CPU põlvkond", description: "Põlvkonna filter ei leia seda pakkumist." },
  "missing-ram": { label: "Puudub RAM", description: "Pakkumine ei jõua poodi." },
  "missing-ssd": { label: "Puudub SSD", description: "Pakkumine ei jõua poodi." },
  "missing-grade": { label: "Puudub seisukord", description: "Pakkumine ei jõua poodi." },
  "unknown-keyboard": { label: "Tundmatu klaviatuur", description: "Klaviatuuri filter ei leia seda pakkumist." },
  "missing-sale-price": { label: "Puudub müügihind", description: "Pakkumine ei jõua poodi." },
  "missing-stock": { label: "Puudub laoseis", description: "Laoseis on teadmata — pakkumine ei jõua poodi." },
} as const;

export type ModelIssue = keyof typeof MODEL_ISSUES;
export type ListingIssue = keyof typeof LISTING_ISSUES;

export const isModelIssue = (value: unknown): value is ModelIssue => typeof value === "string" && value in MODEL_ISSUES;
export const isListingIssue = (value: unknown): value is ListingIssue => typeof value === "string" && value in LISTING_ISSUES;

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
}): ListingIssue[] {
  const issues: ListingIssue[] = [];
  if (!listing.cpu) issues.push("missing-cpu");
  if (!listing.cpuGeneration) issues.push("missing-cpu-gen");
  if (!listing.ramGb) issues.push("missing-ram");
  if (!listing.storageGb) issues.push("missing-ssd");
  if (!listing.grade) issues.push("missing-grade");
  if (!listing.keyboard) issues.push("unknown-keyboard");
  if (listing.salePriceCents === null) issues.push("missing-sale-price");
  if (listing.stock === null && (listing.available ?? null) === null) issues.push("missing-stock");
  return issues;
}

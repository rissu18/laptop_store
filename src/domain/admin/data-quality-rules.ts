import { effectivePerformance } from "@/domain/catalog/benchmarks";
import type { ListingEnrichment } from "@/domain/catalog/enrichment";
import { normalizeKeyboard } from "@/domain/catalog/keyboard";
import type { ListingDetails } from "@/domain/catalog/listing-details";

/**
 * Andmekvaliteedi kontrollid (admin → Andmekvaliteet). Iga kontroll on klikitav filter
 * vastavas nimekirjas (mudelid või konfiguratsioonid). Kontrollid arvestavad EFEKTIIVSEID väärtusi
 * (admini parandus ?? tarnija väärtus) — parandatud väli ei ole enam probleem.
 */
export const MODEL_ISSUES = {
  "no-images": { label: "Mudelid ilma pildita", description: "Pole mudelipilte (Icecat / Laptopid.ee) ega müügis pakkumise fotot — poes kuvatakse placeholder." },
  "few-images": { label: "Mudelid 1–4 pildiga", description: "Poe koondgaleriis on 1–4 pilti (pärast duplikaatide eemaldamist) — sama arvutus mis tootelehel. Ainult müügis mudelid." },
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
  "missing-cpu-benchmark": { label: "CPU kiirusindeks puudub", description: "3DMark06 CPU väärtust pole (tarnijalt ega täpse CPU vastega Laptopid.ee-st) — tootelehel kiirusindeksit ei kuvata." },
  "missing-gpu-benchmark": { label: "GPU kiirusindeks puudub", description: "3DMark11 GPU väärtust pole (tarnijalt ega täpse GPU vastega Laptopid.ee-st)." },
  "missing-cpu-max-mhz": { label: "CPU maks. sagedus puudub", description: "Maksimaalset sagedust pole (tarnijalt ega täpse CPU vastega Laptopid.ee-st)." },
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

/** Kiirusindeksi / maks. sageduse puudumine — eraldi, sest see ei takista müüki (tootelehel lihtsalt ei kuvata). */
export const PERFORMANCE_ISSUES = ["missing-cpu-benchmark", "missing-gpu-benchmark", "missing-cpu-max-mhz"] as const satisfies readonly ListingIssue[];

/** Sama reegel mis tootelehel (benchmarks.ts → effectivePerformance): tarnija → täpse vastega rikastus; CPU/GPU parandus tühistab. */
export function performanceIssuesOf(listing: { details?: unknown; enrichment?: unknown; manualOverrides?: unknown }): ListingIssue[] {
  const performance = effectivePerformance({
    details: (listing.details ?? null) as ListingDetails | null,
    enrichment: (listing.enrichment ?? null) as ListingEnrichment | null,
    manualOverrides: (listing.manualOverrides ?? null) as Record<string, unknown> | null,
  });
  return [
    ...(performance.cpuBenchmark === null ? (["missing-cpu-benchmark"] as const) : []),
    ...(performance.gpuBenchmark === null ? (["missing-gpu-benchmark"] as const) : []),
    ...(performance.cpuMaxGhz === null ? (["missing-cpu-max-mhz"] as const) : []),
  ];
}

/** Lühikesed nimed tabeli veergu "Probleemid" (täisnimi ja kirjeldus: LISTING_ISSUES). */
export const LISTING_ISSUE_SHORT: Record<ListingIssue, string> = {
  "missing-cpu": "CPU puudub",
  "missing-cpu-gen": "CPU põlvkond puudub",
  "missing-ram": "RAM puudub",
  "missing-ssd": "SSD puudub",
  "missing-grade": "Klass puudub",
  "unknown-keyboard": "Klaviatuur teadmata",
  "missing-keyboard": "Klaviatuur puudub",
  "missing-sale-price": "Hind puudub",
  "missing-stock": "Laoseis puudub",
  "missing-cpu-benchmark": "CPU indeks puudub",
  "missing-gpu-benchmark": "GPU indeks puudub",
  "missing-cpu-max-mhz": "Maks. GHz puudub",
};

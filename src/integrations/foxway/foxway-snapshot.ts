import { stableStringify } from "@/integrations/supplier/stable-stringify";
import { normalizeFoxwayLine, type FoxwayOffer, type FoxwaySourceLine } from "./foxway-normalizer";
import type { FoxwayCatalogSlug, FoxwayFeed, FoxwayFeedKey, ParsedPricelist } from "./foxway-schema";

/**
 * Foxway feed'id → üks snapshot (vt docs/FOXWAY_SYNC.md → Snapshot):
 *   1. iga feed'i read normaliseeritakse;
 *   2. dedup SKU järgi — sama SKU võib tulla nii `working` kui ka `new` kataloogist (nt Brand New MacBook):
 *      üks pakkumine, kogust EI liideta (kanooniline rida), erinevad andmed → konflikt (logitakse);
 *   3. usaldusväärsus: kas snapshot'i põhjal tohib puuduvaid pakkumisi maha võtta.
 */

export class FoxwaySnapshotError extends Error {
  constructor(
    public readonly code: "EMPTY_SNAPSHOT",
    message: string,
  ) {
    super(message);
    this.name = "FoxwaySnapshotError";
  }
}

export interface FoxwayFeedInput {
  feed: FoxwayFeed;
  pricelist: ParsedPricelist;
}

export interface FoxwaySnapshotOffer extends FoxwayOffer {
  /** Kataloogid, kus SKU esines (nt ["working", "new"]) */
  catalogs: FoxwayCatalogSlug[];
  feeds: FoxwayFeedKey[];
  /** Kõik toorread (raw_data jaoks) */
  sources: FoxwaySourceLine[];
  /** Kanoonilise rea kataloog (kogus/hind sellest) */
  canonicalCatalog: FoxwayCatalogSlug;
}

export interface FoxwayInvalidRow {
  feed: FoxwayFeedKey;
  sku: string | null;
  productName: string | null;
  reasons: string[];
}

export interface FoxwayDuplicate {
  sku: string;
  catalogs: FoxwayCatalogSlug[];
  conflict: boolean;
  /** Erinevad väljad (nt Quantity, Price, Appearance) */
  differences: string[];
}

export interface FoxwayFeedReport {
  key: FoxwayFeedKey;
  label: string;
  catalog: FoxwayCatalogSlug;
  itemGroupId: number;
  rows: number;
  quantity: number;
  invalid: number;
}

export interface FoxwaySnapshot {
  feeds: FoxwayFeedReport[];
  offers: FoxwaySnapshotOffer[];
  invalid: FoxwayInvalidRow[];
  /** Kõik snapshot'is esinenud SKU-d (ka vigased read kehtiva SKU-ga) — neid ei võeta "puuduvana" maha */
  seenSkus: Set<string>;
  duplicates: FoxwayDuplicate[];
  counts: {
    lines: number;
    invalidRows: number;
    uniqueSkus: number;
    duplicateSkus: number;
    duplicateConflicts: number;
    totalQuantity: number;
  };
}

/** Rea sisu võrdlemiseks (kataloogi ei arvestata) */
function comparable(source: FoxwaySourceLine) {
  const l = source.line;
  const dims = Object.fromEntries((l.Dimension ?? []).filter((d) => d.Key).map((d) => [d.Key!, d.Value ?? null]));
  return { ProductName: l.ProductName, ItemVariantId: l.ItemVariantId, Quantity: l.Quantity, Price: l.Price, CurrencyIsoCode: l.CurrencyIsoCode, IsVatMargin: l.IsVatMargin, ...dims };
}

/** Kanooniline rida: Brand New seadme puhul `new` kataloogi rida, muidu `working` (seisukorra määrab Appearance) */
function pickCanonical(offers: { offer: FoxwayOffer; source: FoxwaySourceLine }[]) {
  const preferred = offers[0].offer.grade === "NEW" ? "new" : "working";
  return offers.find((o) => o.source.catalog === preferred) ?? offers[0];
}

export function buildFoxwaySnapshot(feeds: FoxwayFeedInput[]): FoxwaySnapshot {
  const reports: FoxwayFeedReport[] = [];
  const invalid: FoxwayInvalidRow[] = [];
  const bySku = new Map<string, { offer: FoxwayOffer; source: FoxwaySourceLine }[]>();
  const seenSkus = new Set<string>();
  let lines = 0;

  for (const { feed, pricelist } of feeds) {
    let quantity = 0;
    let feedInvalid = pricelist.invalid.length;
    for (const bad of pricelist.invalid) {
      invalid.push({ feed: feed.key, sku: bad.sku, productName: null, reasons: [`Skeemiviga: ${bad.reason}`] });
      if (bad.sku && /^[A-Za-z0-9._-]{3,64}$/.test(bad.sku)) seenSkus.add(bad.sku);
    }
    for (const line of pricelist.lines) {
      const source: FoxwaySourceLine = { feed: feed.key, catalog: feed.catalog, line };
      const result = normalizeFoxwayLine(source);
      if (result.kind === "INVALID") {
        feedInvalid++;
        invalid.push({ feed: feed.key, sku: result.sku, productName: result.productName, reasons: result.reasons });
        if (result.sku) seenSkus.add(result.sku);
        continue;
      }
      quantity += result.offer.quantity;
      seenSkus.add(result.offer.sku);
      bySku.set(result.offer.sku, [...(bySku.get(result.offer.sku) ?? []), { offer: result.offer, source }]);
    }
    lines += pricelist.lines.length + pricelist.invalid.length;
    reports.push({ key: feed.key, label: feed.label, catalog: feed.catalog, itemGroupId: feed.itemGroupId, rows: pricelist.lines.length + pricelist.invalid.length, quantity, invalid: feedInvalid });
  }

  const offers: FoxwaySnapshotOffer[] = [];
  const duplicates: FoxwayDuplicate[] = [];
  for (const [sku, entries] of bySku) {
    const canonical = pickCanonical(entries);
    if (entries.length > 1) {
      const base = comparable(canonical.source);
      const differences = new Set<string>();
      for (const entry of entries) {
        if (entry === canonical) continue;
        const other = comparable(entry.source);
        for (const key of new Set([...Object.keys(base), ...Object.keys(other)])) {
          if (stableStringify((base as Record<string, unknown>)[key] ?? null) !== stableStringify((other as Record<string, unknown>)[key] ?? null)) differences.add(key);
        }
      }
      duplicates.push({ sku, catalogs: entries.map((e) => e.source.catalog), conflict: differences.size > 0, differences: [...differences] });
    }
    offers.push({
      ...canonical.offer,
      catalogs: [...new Set(entries.map((e) => e.source.catalog))],
      feeds: entries.map((e) => e.source.feed),
      sources: entries.map((e) => e.source),
      canonicalCatalog: canonical.source.catalog,
    });
  }
  offers.sort((a, b) => a.sku.localeCompare(b.sku));

  if (lines === 0) throw new FoxwaySnapshotError("EMPTY_SNAPSHOT", "Ükski Foxway feed ei andnud ridu — tühja snapshot'i põhjal kataloogi ei muudeta");

  return {
    feeds: reports,
    offers,
    invalid,
    seenSkus,
    duplicates,
    counts: {
      lines,
      invalidRows: invalid.length,
      uniqueSkus: offers.length,
      duplicateSkus: duplicates.length,
      duplicateConflicts: duplicates.filter((d) => d.conflict).length,
      // Täpne laoseis: iga SKU üks kord (duplikaate ei liideta)
      totalQuantity: offers.reduce((n, o) => n + o.quantity, 0),
    },
  };
}

/** Puuduvate mahavõtmise piirid (sama loogika mis Laptopid.ee / Tech: pigem jäta saadavaks kui võta kõik maha) */
export const FOXWAY_INVALID_RATIO = 0.2;
export const FOXWAY_INVALID_MIN = 10;
export const FOXWAY_DROP_RATIO = 0.5;
export const FOXWAY_DROP_MIN = 20;

export function decideFoxwayTrust(
  snapshot: Pick<FoxwaySnapshot, "seenSkus" | "counts">,
  previous: { availableSkus: string[] },
  options: { allowLargeDrop?: boolean } = {},
): { trusted: boolean; reason: string | null; missing: number } {
  const missing = previous.availableSkus.filter((sku) => !snapshot.seenSkus.has(sku)).length;
  const invalidLimit = Math.max(FOXWAY_INVALID_MIN, Math.floor(snapshot.counts.lines * FOXWAY_INVALID_RATIO));
  if (snapshot.counts.invalidRows > invalidLimit) {
    return { trusted: false, reason: `Liiga palju vigaseid ridu (${snapshot.counts.invalidRows} / ${snapshot.counts.lines}) — puuduvaid ei võeta maha`, missing };
  }
  const dropLimit = Math.max(FOXWAY_DROP_MIN, Math.floor(previous.availableSkus.length * FOXWAY_DROP_RATIO));
  if (missing > dropLimit && !options.allowLargeDrop) {
    return { trusted: false, reason: `Liiga suur muutus: ${missing} varem saadaval SKU-d puuduvad korraga (piir ${dropLimit}) — kinnita adminis "Luba suur muutus"`, missing };
  }
  return { trusted: true, reason: null, missing };
}

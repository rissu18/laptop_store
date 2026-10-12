/**
 * Kataloogi rikastus (enrichment) — LOCAL-FIRST.
 *
 *   tarnija sync / `npm run enrich:catalog` / admini toiming
 *     → allikad prioriteediga: 1) meie andmebaas (admini parandus, kinnitatud väärtus, teised pakkumised)
 *                              2) Laptopid.ee andmed (sync'itud Laptopid.ee pakkumised ja nende pildid)
 *                              3) Icecat (ainult kui 1 ja 2 ei andnud midagi)
 *     → tulemus salvestatakse MEIE andmebaasi (`supplier_listings.enrichment`, `product_models.enrichment`,
 *       `product_images` allikaga LAPTOPID / ICECAT)
 *   pood loeb AINULT meie andmebaasi — lehe renderdamisel ei küsita Laptopid.ee-d ega Icecatit.
 *
 * Efektiivne väärtus: admini parandus (manual_overrides) ?? tarnija väärtus ?? rikastatud väärtus.
 * Tarnija toorväärtus säilib alati (raw_data); sync ei kirjuta `enrichment` veergu ja rikastus ei kirjuta tarnija veerge.
 */

export const ENRICHMENT_SOURCES = ["LOCAL", "LAPTOPID", "ICECAT"] as const;
export type EnrichmentSource = (typeof ENRICHMENT_SOURCES)[number];

export interface EnrichedValue<T> {
  value: T;
  source: EnrichmentSource;
  /** Mille järgi leiti (nt "cpu:i5-1135g7 (12 pakkumist)") — adminile */
  matchedBy: string;
  /** 0–1 */
  confidence: number;
  at: string;
}

/** Pakkumise rikastatud tehnilised andmed (`supplier_listings.enrichment`) */
export interface ListingEnrichment {
  /** Integreeritud graafika nimi, kui tarnija ütles ainult "Integrated" (nt "Intel Iris Xe Graphics") */
  gpu?: EnrichedValue<string>;
  /** Täpne resolutsioon, kui tarnija andis ainult nime (nt Apple "Retina") */
  resolution?: EnrichedValue<{ resolution: string; label: string | null }>;
}

export const IMAGE_ENRICHMENT_STATUSES = ["LOCAL", "LAPTOPID", "ICECAT", "REVIEW", "UNRESOLVED"] as const;
export type ImageEnrichmentStatus = (typeof IMAGE_ENRICHMENT_STATUSES)[number];

/** Mudeli pildirikastuse otsus (`product_models.enrichment.images`) */
export interface ModelImageEnrichment {
  /** LOCAL = mudelil olid pildid juba olemas; REVIEW = võimalik, aga ebakindel vaste (pilte ei lisatud); UNRESOLVED = vastet pole */
  status: ImageEnrichmentStatus;
  /** Laptopid.ee vaste mudel (slug), kust pildid tulid / kandidaadid ülevaatuseks */
  matchedModelSlug?: string | null;
  matchedBy?: string | null;
  confidence?: number | null;
  candidates?: string[];
  imageCount?: number;
  /** Icecati katse tulemus (MATCHED / NOT_FOUND / NEEDS_REVIEW / ERROR / SKIPPED) */
  icecat?: string | null;
  checkedAt: string;
}

export interface ModelEnrichment {
  images?: ModelImageEnrichment;
}

/** Integreeritud graafika üldnimi, kui tarnija ütles ainult "Integrated" ja täpsemat nime ükski allikas ei andnud */
export const GENERIC_INTEGRATED_GPU = "Integreeritud graafika";

interface GpuFields {
  gpu: string | null;
  gpuDedicated: boolean | null;
  resolution: string | null;
  resolutionLabel: string | null;
}

/**
 * Efektiivne pakkumine koos rikastusega: tarnija/admini väärtus jääb, rikastus täidab ainult tühja välja.
 * Täpsemat tarnija GPU-d ei asendata kunagi; rikastatud GPU on alati integreeritud (dedicated = false).
 */
export function applyListingEnrichment<T extends GpuFields>(listing: T, enrichment: ListingEnrichment | null | undefined): T {
  if (!enrichment) return listing;
  const next = { ...listing };
  if (!next.gpu?.trim() && enrichment.gpu && next.gpuDedicated !== true) {
    next.gpu = enrichment.gpu.value;
    next.gpuDedicated = false;
  }
  if (!next.resolution && enrichment.resolution) {
    next.resolution = enrichment.resolution.value.resolution;
    next.resolutionLabel = enrichment.resolution.value.label ?? next.resolutionLabel;
  }
  return next;
}

/** Kliendile kuvatav graafika: täpne nimi; tarnija "Integrated" ilma täpsema nimeta → "Integreeritud graafika"; teadmata → "" */
export function displayGpu(gpu: string | null, dedicated: boolean | null): string {
  if (gpu?.trim()) return gpu.trim();
  return dedicated === false ? GENERIC_INTEGRATED_GPU : "";
}

// ---- GPU rikastus CPU järgi ------------------------------------------------------------------------------------

/**
 * Integreeritud graafika sõltub ainult protsessorist (i5-1135G7 → Iris Xe igas mudelis). Võti = CPU mudelinumber
 * (tootja nimi ja tühikud välja): "Intel Core i5-1135G7" → "i5-1135g7", "AMD Ryzen 5 PRO 5650U" → "ryzen 5 pro 5650u".
 * Apple'i kiibi GPU sõltub konfiguratsioonist (7/8/10 tuuma) → ainult täpselt sama nimega CPU.
 */
export function cpuGpuKey(cpu: string): string {
  return cpu
    .toLowerCase()
    .replace(/\((r|tm)\)|®|™/g, "")
    .replace(/\b(intel|amd|core|processor|cpu)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** "Intel Iris Xe Graphics" ja "Intel Iris Xe" on sama — võrdlusvõti */
export function gpuNameKey(gpu: string): string {
  return gpu
    .toLowerCase()
    .replace(/\((r|tm)\)|®|™/g, "")
    .replace(/\b(graphics|gpu)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export interface GpuSample {
  cpu: string;
  gpu: string;
  supplier: string;
}

export interface GpuCandidate {
  value: string;
  source: EnrichmentSource;
  samples: number;
}

/**
 * Integreeritud GPU kandidaadid CPU võtme järgi. Prioriteet: Laptopid.ee pakkumiste väärtus → muud meie andmebaasi
 * pakkumised (Tech, admini parandused). Kasutatakse ainult üksmeelset väärtust: kui samal CPU-l on mitu erinevat
 * GPU nime, jäetakse see CPU vahele (ei arvata).
 */
export function buildIntegratedGpuIndex(samples: GpuSample[]): Map<string, GpuCandidate> {
  const groups = new Map<string, { laptopid: Map<string, { name: string; n: number }>; local: Map<string, { name: string; n: number }> }>();
  for (const s of samples) {
    if (!s.cpu.trim() || !s.gpu.trim()) continue;
    const key = cpuGpuKey(s.cpu);
    const group = groups.get(key) ?? { laptopid: new Map(), local: new Map() };
    const bucket = s.supplier === "laptopid" ? group.laptopid : group.local;
    const nameKey = gpuNameKey(s.gpu);
    const entry = bucket.get(nameKey) ?? { name: s.gpu.trim(), n: 0 };
    entry.n++;
    // Pikem nimi on täpsem ("Intel Iris Xe Graphics" > "Intel Iris Xe")
    if (s.gpu.trim().length > entry.name.length) entry.name = s.gpu.trim();
    bucket.set(nameKey, entry);
    groups.set(key, group);
  }
  const index = new Map<string, GpuCandidate>();
  for (const [key, group] of groups) {
    // Laptopid.ee eelistatud; kui seal on vastuolu, ei minda teise allika juurde (ei arvata)
    const [bucket, source] = group.laptopid.size > 0 ? ([group.laptopid, "LAPTOPID"] as const) : ([group.local, "LOCAL"] as const);
    if (bucket.size !== 1) continue;
    const [only] = bucket.values();
    index.set(key, { value: only.name, source, samples: only.n });
  }
  return index;
}

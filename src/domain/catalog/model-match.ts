/**
 * Mudeli vaste teise allika mudeliga (nt Foxway/Techi mudel ↔ Laptopid.ee mudel) PILTIDE jaoks.
 *
 * Põhimõte: vale pilt on hullem kui placeholder. Automaatne vaste ainult siis, kui
 *   - tootja on sama,
 *   - normaliseeritud mudelivõti (seeria + mudel, konfiguratsiooni sabad eemaldatud) on TÄPSELT sama (sõnade hulk),
 *   - ekraani suurus klapib (±0,7" — Tech ümardab 15,6" → 15), kui see on mõlemal teada,
 *   - kandidaate on täpselt üks.
 * Peaaegu-vaste (üks variandisõna erineb: "7310" vs "7310 Carbon", "L15" vs "L15 Gen 1") → REVIEW (pilte ei lisata).
 *
 * Apple: võti = rida (MacBook / Air / Pro) + ekraan (tolli täisarv) + aasta + kiibi põlvkond (M1, M2 …; Intel = "intel").
 * Foxway lühendab nime ("Apple MacBook Pro (16" 2023, M2)" → mudel "M2 Pro 2023"), seega kasutatakse ka tarnija
 * algset tootenime ja pakkumiste CPU-d, mitte ainult kuvatavat mudelinime.
 */

export interface MatchableModel {
  id: string;
  slug: string;
  manufacturer: string;
  family: string;
  model: string;
  screenSizeIn: number | null;
  /** Tarnija algsed tootenimed (Foxway ProductName) — Apple'i aasta/suurus/kiip */
  rawNames?: string[];
  /** Pakkumiste CPU nimed — Apple'i kiip, kui nimes pole */
  cpus?: string[];
}

export type ModelMatch =
  | { status: "MATCH"; target: MatchableModel; matchedBy: string; confidence: number }
  | { status: "REVIEW"; candidates: MatchableModel[]; matchedBy: string }
  | { status: "NONE" };

// Konfiguratsiooni/kirjelduse sabad, mis ei muuda korpust ega pilti
const NOISE = new Set(["touch", "intel", "amd", "ryzen", "laptop", "notebook", "series", "edition", "the"]);

function words(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/\(\s*(\d{1,2})(?:st|nd|rd|th)\s+gen(?:eration)?(?:\s+intel)?\s*\)/g, " gen $1 ") // "(6th Gen)" → gen 6
    .replace(/\((?:19|20)\d{2}\)/g, " ") // "(2023)"
    .replace(/\b\d{1,2}(?:[.,]\d)?\s*(?:"|''|”|″|inch|-inch|tolli)/g, " ") // 14", 15.6"
    .replace(/\bgen(?:eration)?\s*(\d{1,2})\b/g, " g$1 ") // "Gen 3" → g3 (Lenovo "G3" on sama)
    .replace(/[^a-z0-9-]+/g, " ")
    .split(/\s+/)
    .filter((w) => w && !NOISE.has(w));
}

/** Seeria + mudeli sõnade hulk; ekraani suurusega võrduv eraldi number (Dell "14 Rugged 5430") jäetakse välja */
export function modelTokens(model: Pick<MatchableModel, "family" | "model" | "screenSizeIn">): string[] {
  const family = words(model.family);
  let tokens = words(model.model);
  // Mudelinimi kordab sageli seeriat ("Aspire 3 A315" seerias "Aspire") — seeria sõnad lisatakse üks kord
  tokens = [...family, ...tokens.filter((t) => !family.includes(t))];
  const size = model.screenSizeIn ? String(Math.round(model.screenSizeIn)) : null;
  if (size && tokens.some((t) => /\d/.test(t) && t !== size)) tokens = tokens.filter((t) => t !== size);
  return [...new Set(tokens)].sort();
}

function sizeCompatible(a: number | null, b: number | null): boolean {
  return a === null || b === null || Math.abs(a - b) <= 0.7;
}

// ---- Apple --------------------------------------------------------------------------------------------------

export interface AppleKey {
  line: "air" | "pro" | "macbook";
  size: number | null;
  year: number | null;
  chip: string | null;
}

export function appleKey(model: MatchableModel): AppleKey | null {
  if (model.manufacturer !== "apple") return null;
  const texts = [`${model.family} ${model.model}`, ...(model.rawNames ?? [])];
  const all = texts.join(" | ");
  const line = /\bair\b/i.test(all) ? "air" : /\bpro\b/i.test(model.family) || /macbook\s+pro/i.test(all) ? "pro" : /macbook/i.test(all) ? "macbook" : null;
  if (!line) return null;
  const sizeFromName = all.match(/\b(1[1-7])(?:[.,]\d)?\s*(?:"|''|”|″|-inch)/)?.[1];
  const size = sizeFromName ? Number(sizeFromName) : model.screenSizeIn ? Math.round(model.screenSizeIn) : null;
  const year = Number(all.match(/\b(20[12]\d)\b/)?.[1]) || null;
  const chipText = [...texts, ...(model.cpus ?? [])].join(" ");
  const chip = chipText.match(/\bM(\d)\b/i)?.[1] ? `m${chipText.match(/\bM(\d)\b/i)![1]}` : /\b(intel|core\s*i\d)\b/i.test(chipText) ? "intel" : null;
  return { line, size, year, chip };
}

function sameApple(a: AppleKey, b: AppleKey): boolean {
  // Kõik neli peavad olema teada ja võrdsed (Air 13" 2020 Intel ≠ Air 13" 2020 M1)
  return a.line === b.line && a.size !== null && a.size === b.size && a.year !== null && a.year === b.year && a.chip !== null && a.chip === b.chip;
}

const describeApple = (k: AppleKey) => `apple:${k.line}-${k.size}-${k.year}-${k.chip}`;

// ---- Vaste --------------------------------------------------------------------------------------------------

export function findModelMatch(model: MatchableModel, pool: MatchableModel[]): ModelMatch {
  const sameBrand = pool.filter((p) => p.manufacturer === model.manufacturer && p.id !== model.id);

  const apple = appleKey(model);
  if (model.manufacturer === "apple") {
    if (!apple) return { status: "NONE" };
    const exact = sameBrand.filter((p) => {
      const key = appleKey(p);
      return key !== null && sameApple(apple, key);
    });
    if (exact.length === 1) return { status: "MATCH", target: exact[0], matchedBy: describeApple(apple), confidence: 0.95 };
    if (exact.length > 1) return { status: "REVIEW", candidates: exact, matchedBy: describeApple(apple) };
    return { status: "NONE" };
  }

  const tokens = modelTokens(model);
  if (!tokens.some((t) => /\d/.test(t))) return { status: "NONE" }; // ainult seeria nimi ("Cloud") — liiga üldine
  const key = tokens.join(" ");
  const compatible = sameBrand.filter((p) => sizeCompatible(model.screenSizeIn, p.screenSizeIn));
  const exact = compatible.filter((p) => modelTokens(p).join(" ") === key);
  if (exact.length === 1) return { status: "MATCH", target: exact[0], matchedBy: `name:${key}`, confidence: 0.95 };
  if (exact.length > 1) return { status: "REVIEW", candidates: exact, matchedBy: `name:${key}` };

  // Peaaegu-vaste: üks sõna juures/puudu ja kõik ülejäänud (sh mudelinumbrid) samad → ülevaatusele, mitte automaatselt
  const near = compatible.filter((p) => {
    const other = modelTokens(p);
    const [small, large] = other.length < tokens.length ? [other, tokens] : [tokens, other];
    return large.length - small.length === 1 && small.every((t) => large.includes(t)) && small.some((t) => /\d/.test(t));
  });
  if (near.length) return { status: "REVIEW", candidates: near, matchedBy: `near:${key}` };
  return { status: "NONE" };
}

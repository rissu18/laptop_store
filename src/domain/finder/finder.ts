import { buildCatalogHref, emptyQuery, type CatalogQuery } from "@/domain/catalog/query";
import { cpuTier, isHighPerformanceCpu } from "@/domain/catalog/spec-explanations";
import type { CatalogItem, FeatureKey } from "@/domain/catalog/types";

/**
 * "Leia sobiv" — deterministlik 4-sammuline soovitaja (mitte AI).
 *
 * Iga vastus annab tootele punkte reeglite järgi; iga punkt tuleb koos lühikese põhjendusega,
 * mida kliendile näidatakse ("Miks sobib sulle").
 * OLULINE: kui tootel vajalik andmeväli puudub (nt kaal, aku), punkte EI anta — midagi ei eeldata.
 */

export const PURPOSES = [
  { key: "work", label: "Tööle" },
  { key: "school", label: "Kooliks / õppimiseks" },
  { key: "home", label: "Koduseks kasutamiseks" },
  { key: "travel", label: "Reisile / palju kaasas" },
  { key: "programming", label: "Programmeerimiseks" },
  { key: "design", label: "Kujundamiseks / videotööks" },
] as const;
export type Purpose = (typeof PURPOSES)[number]["key"];

/** Avalehe "Milleks sülearvutit vajad?" → /leia-sobiv?eesmark=work (leidja alustab eelvalitud eesmärgiga) */
export const PURPOSE_PARAM = "eesmark";

export function parsePurpose(value: unknown): Purpose | null {
  return PURPOSES.find((p) => p.key === value)?.key ?? null;
}

export function finderHrefForPurpose(purpose: Purpose): string {
  return `/leia-sobiv?${PURPOSE_PARAM}=${purpose}`;
}

export const BUDGETS = [
  { key: "0-300", label: "kuni 300 €", min: null, max: 300 },
  { key: "300-500", label: "300–500 €", min: 300, max: 500 },
  { key: "500-700", label: "500–700 €", min: 500, max: 700 },
  { key: "700-1000", label: "700–1000 €", min: 700, max: 1000 },
  { key: "1000+", label: "1000 €+", min: 1000, max: null },
] as const;
export type BudgetKey = (typeof BUDGETS)[number]["key"];

export const CARRY_OPTIONS = [
  { key: "rarely", label: "Harva" },
  { key: "sometimes", label: "Mõnikord" },
  { key: "daily", label: "Iga päev" },
] as const;
export type Carry = (typeof CARRY_OPTIONS)[number]["key"];

export const PRIORITIES = [
  { key: "battery", label: "Pikk aku" },
  { key: "light", label: "Kerge" },
  { key: "big-screen", label: "Suur ekraan" },
  { key: "numpad", label: "Numbriklahvistik" },
  { key: "touch", label: "Puuteekraan" },
  { key: "fast-cpu", label: "Võimas protsessor" },
  { key: "ram", label: "Palju RAM-i" },
] as const;
export type Priority = (typeof PRIORITIES)[number]["key"];

export interface FinderAnswers {
  purpose: Purpose;
  budget: BudgetKey;
  carry: Carry;
  priorities: Priority[];
}

export interface ScoredItem {
  item: CatalogItem;
  score: number;
  reasons: { points: number; text: string }[];
}

export interface FinderResult {
  best: ScoredItem | null;
  cheapest: ScoredItem | null;
  strongest: ScoredItem | null;
  matchingCount: number;
  allMatchingHref: string;
}

const budgetOf = (key: BudgetKey) => BUDGETS.find((b) => b.key === key)!;

export function inBudget(item: CatalogItem, key: BudgetKey): boolean {
  const { min, max } = budgetOf(key);
  const euros = item.variant.price.saleCents / 100;
  return (min === null || euros >= min) && (max === null || euros <= max);
}

/** Jõudlusindeks "Võimsaim sobiv" valikuks: CPU klass, põlvkond, RAM, eraldi GPU. */
export function powerIndex({ variant }: CatalogItem): number {
  const tier = cpuTier(variant.cpu.family) ?? 2;
  const highPerf = isHighPerformanceCpu(variant.cpu.model) ? 1.5 : 0;
  const generation = Number(variant.cpu.generationKey?.match(/\d+/)?.[0] ?? 0);
  const genScore = generation > 100 ? (generation / 1000 - 3) * 0.5 : (generation - 8) * 0.3;
  return tier * 3 + highPerf + Math.max(0, genScore) + Math.log2(Math.max(8, variant.ramGb)) + (variant.gpu.dedicated ? 2 : 0);
}

export function scoreItem(item: CatalogItem, answers: FinderAnswers): ScoredItem {
  const { product, variant } = item;
  // Sama teema (nt mälu) mitu põhjust liidetakse üheks: punktid summeeritakse, kuvatakse esimene tekst
  const byTopic = new Map<string, { points: number; text: string }>();
  const topicOf = (text: string) =>
    /mälu/i.test(text) ? "ram" : /protsessor/i.test(text) ? "cpu" : /kerge|kaal|kaasas/i.test(text) ? "weight" : /graafika/i.test(text) ? "gpu" : text;
  const add = (points: number, text: string) => {
    const topic = topicOf(text);
    const existing = byTopic.get(topic);
    byTopic.set(topic, existing ? { ...existing, points: existing.points + points } : { points, text });
  };
  const tier = cpuTier(variant.cpu.family);
  const strongCpu = (tier !== null && tier >= 3) || isHighPerformanceCpu(variant.cpu.model);
  const weight = product.weightKg; // null = teadmata → kaalupunkte ei anta
  const screen = product.screenSizeIn;
  const isWindows = variant.os ? /windows/i.test(variant.os) : false;
  const highRes = variant.display.resolution ? Number(variant.display.resolution.split("x")[0]) >= 2560 : false;

  // 1. Kasutusotstarve
  switch (answers.purpose) {
    case "work":
      add(10, "Äriklassi sülearvuti igapäevaseks tööks");
      if (variant.ramGb >= 16) add(15, `${variant.ramGb} GB mälu sujuvaks multitaskinguks`);
      if (tier !== null && tier >= 2) add(10, "Kontoritööks piisav protsessor");
      if (isWindows) add(5, "Windows tööprogrammide jaoks");
      break;
    case "school":
      if (variant.ramGb >= 8) add(5, "Piisav mälu õppimiseks");
      if (weight !== null && weight <= 1.5) add(8, "Kerge koolikotti panna");
      break;
    case "home":
      if (screen >= 14) add(8, "Mugav ekraan videote ja veebi jaoks");
      break;
    case "travel":
      if (screen <= 14) add(15, "Kompaktne ekraan reisimiseks");
      if (weight !== null && weight <= 1.3) add(15, `Kerge (${weight.toString().replace(".", ",")} kg)`);
      else if (weight !== null && weight <= 1.5) add(8, `Mõõdukas kaal (${weight.toString().replace(".", ",")} kg)`);
      if (variant.features.lte) add(5, "Mobiilne internet (4G/LTE)");
      break;
    case "programming":
      if (variant.ramGb >= 16) add(15, `${variant.ramGb} GB mälu arenduskeskkondadele`);
      if (variant.ramGb >= 32) add(10, "32 GB+ ka virtuaalmasinatele ja konteineritele");
      if (strongCpu) add(10, "Tugevam protsessor kompileerimiseks");
      if (variant.storageGb >= 512) add(8, "Piisavalt SSD-ruumi projektidele");
      break;
    case "design":
      if (variant.ramGb >= 32) add(15, `${variant.ramGb} GB mälu suurtele failidele`);
      if (variant.gpu.dedicated) add(20, `Eraldi graafikakaart (${variant.gpu.model})`);
      if (highRes) add(10, "Kõrge resolutsiooniga ekraan");
      if (screen >= 15) add(5, "Suur ekraan detailseks tööks");
      break;
  }

  // 2. Eelarve: odavam toode saab eelarve piires veidi lisapunkte (koolile/kodule rohkem)
  const { max } = budgetOf(answers.budget);
  if (max !== null) {
    const savingsShare = 1 - variant.price.saleCents / 100 / max;
    const weightFactor = answers.purpose === "school" || answers.purpose === "home" ? 20 : 6;
    const points = Math.round(Math.max(0, savingsShare) * weightFactor);
    if (points >= 3) add(points, "Hea hind sinu eelarves");
  }

  // 3. Kaasas kandmine
  if (answers.carry === "daily") {
    if (weight !== null && weight <= 1.4) add(15, "Sobib iga päev kaasas kandmiseks");
    if (screen <= 14) add(5, "Kompaktne mõõt");
  } else if (answers.carry === "sometimes") {
    if (weight !== null && weight <= 1.6) add(5, "Mõistlik kaal aeg-ajalt kaasa võtmiseks");
  } else if (screen >= 15) {
    add(3, "Suurem ekraan laua taga töötamiseks");
  }

  // 4. Olulised omadused (ainult päris andmete põhjal)
  for (const priority of answers.priorities) {
    switch (priority) {
      case "battery":
        // Aku kestvuse andmeid meil pole; arvestame ainult tarnija teatatud aku seisukorda, kui see on olemas
        if (variant.batteryHealthPct !== null && variant.batteryHealthPct >= 85) add(8, `Aku seisukord vähemalt ${variant.batteryHealthPct}%`);
        break;
      case "light":
        if (weight !== null && weight <= 1.4) add(15, "Kerge");
        break;
      case "big-screen":
        if (screen >= 15) add(15, "Suur ekraan");
        break;
      case "numpad":
        if (variant.features.numpad === true) add(15, "Numbriklahvistik");
        break;
      case "touch":
        if (variant.features.touch === true) add(15, "Puuteekraan");
        break;
      case "fast-cpu":
        if (strongCpu) add(15, "Võimas protsessor");
        break;
      case "ram":
        if (variant.ramGb >= 32) add(15, `${variant.ramGb} GB mälu`);
        else if (variant.ramGb >= 16) add(5, "16 GB mälu");
        break;
    }
  }

  // Seisukord: väike boonus paremale klassile
  const gradeBonus = { NEW: 4, "A+": 4, A: 3, B: 1, C: 0 }[variant.grade];
  if (gradeBonus) add(gradeBonus, `Seisukord ${variant.grade}`);

  const reasons = [...byTopic.values()];
  const score = reasons.reduce((sum, r) => sum + r.points, 0);
  return { item, score, reasons: reasons.sort((a, b) => b.points - a.points) };
}

/** Link nimekirjale sobivate filtritega ("Vaata kõiki sobivaid"). */
export function finderCatalogHref(answers: FinderAnswers): string {
  const { min, max } = budgetOf(answers.budget);
  const features: FeatureKey[] = [];
  if (answers.priorities.includes("numpad")) features.push("numpad");
  if (answers.priorities.includes("touch")) features.push("touch");
  if (answers.priorities.includes("light") || answers.carry === "daily") features.push("light");
  const query: CatalogQuery = { ...emptyQuery(), minPrice: min, maxPrice: max, features };
  if (answers.purpose === "design") query.features = [...features, "dedicated-gpu"];
  return buildCatalogHref("/sulearvutid", query);
}

/**
 * Tulemus: kuni 3 eri mudelit
 *   PARIM VALIK      — kõrgeim skoor
 *   SOODSAIM SOBIV   — odavaim, mille skoor on vähemalt 60% parimast
 *   VÕIMSAIM SOBIV   — suurim jõudlusindeks, mille skoor on vähemalt 50% parimast
 */
export function recommendLaptops(items: CatalogItem[], answers: FinderAnswers): FinderResult {
  const eligible = items.filter((item) => item.variant.stock.available && inBudget(item, answers.budget));
  const scored = eligible
    .map((item) => scoreItem(item, answers))
    .sort((a, b) => b.score - a.score || a.item.variant.price.saleCents - b.item.variant.price.saleCents || a.item.variant.sku.localeCompare(b.item.variant.sku));

  const best = scored[0] ?? null;
  const usedModels = new Set(best ? [best.item.product.slug] : []);
  const pick = (candidates: ScoredItem[]) => {
    const found = candidates.find((c) => !usedModels.has(c.item.product.slug)) ?? null;
    if (found) usedModels.add(found.item.product.slug);
    return found;
  };

  const cheapest = best
    ? pick(
        scored
          .filter((s) => s.score >= best.score * 0.6)
          .sort((a, b) => a.item.variant.price.saleCents - b.item.variant.price.saleCents || b.score - a.score),
      )
    : null;
  const strongest = best
    ? pick(
        scored
          .filter((s) => s.score >= best.score * 0.5)
          .sort((a, b) => powerIndex(b.item) - powerIndex(a.item) || b.score - a.score),
      )
    : null;

  return { best, cheapest, strongest, matchingCount: eligible.length, allMatchingHref: finderCatalogHref(answers) };
}

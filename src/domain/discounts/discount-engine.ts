import { formatEur } from "@/domain/money/money";

/**
 * DiscountEngine — ainus koht, kus sooduskoodi kehtivust ja summat arvutatakse.
 *
 * Puhas funktsioon (ei loe andmebaasi ega kella ise): sisend on koodi reeglid, SERVERIS arvutatud
 * ostukorvi read ja serveri aeg. Sama funktsiooni kasutavad ostukorv, admini eelvaade, testid ja
 * tulevikus kassa + tellimuse loomine. Klient ei saa kunagi ise soodustuse summat määrata.
 *
 * Arvutuse järjekord (vt docs/DISCOUNTS.md):
 *   1. staatus (mustand/arhiveeritud/väljalülitatud)   2. kehtivusaeg   3. kasutuspiirang
 *   4. ostukorv pole tühi   5. sobivad read (kehtib + välistused)   6. miinimumsumma
 *   7. toorsoodustus (% või €) + maksimum   8. jaotus ridadele   9. marginaalikaitse   10. kokkusumma ≥ 0
 */

export const DISCOUNT_TYPES = ["PERCENTAGE", "FIXED_AMOUNT", "FREE_SHIPPING"] as const;
export type DiscountType = (typeof DISCOUNT_TYPES)[number];

/** Admini määratud olek (andmebaasis). */
export const DISCOUNT_STATUSES = ["DRAFT", "ACTIVE", "DISABLED", "ARCHIVED"] as const;
export type DiscountStatus = (typeof DISCOUNT_STATUSES)[number];

/** Tegelik olek antud hetkel (arvutatud): ACTIVE + tulevane algus = SCHEDULED, möödunud lõpp = EXPIRED. */
export const EFFECTIVE_DISCOUNT_STATUSES = ["DRAFT", "SCHEDULED", "ACTIVE", "EXPIRED", "DISABLED", "ARCHIVED"] as const;
export type EffectiveDiscountStatus = (typeof EFFECTIVE_DISCOUNT_STATUSES)[number];

export const DISCOUNT_SCOPES = ["ALL_PRODUCTS", "SELECTED_MANUFACTURERS", "SELECTED_PRODUCT_MODELS", "SELECTED_LISTINGS"] as const;
export type DiscountScope = (typeof DISCOUNT_SCOPES)[number];

export interface DiscountRule {
  code: string;
  normalizedCode: string;
  type: DiscountType;
  /** PERCENTAGE: baaspunktid (1000 = 10%); FIXED_AMOUNT: sendid; FREE_SHIPPING: 0 */
  value: number;
  status: DiscountStatus;
  startsAt: Date | null;
  expiresAt: Date | null;
  minimumSubtotalCents: number | null;
  maximumDiscountCents: number | null;
  usageLimit: number | null;
  /** Kinnitatud kasutuste arv (DiscountRedemption) — kontroll EI suurenda seda */
  usageCount: number;
  scope: DiscountScope;
  /** Valikud stabiilsete võtmete järgi: tootja kood, mudeli slug, pakkumise SKU */
  manufacturers: string[];
  productModels: string[];
  listings: string[];
  excludedProductModels: string[];
  excludedListings: string[];
  respectMinimumMargin: boolean;
}

/** Ostukorvi rida — hinnad tulevad ALATI serverist (andmebaas), mitte brauserist. */
export interface DiscountCartLine {
  /** Pakkumise SKU (SupplierListing) */
  listing: string;
  /** Mudeli slug (ProductModel) */
  productModel: string;
  manufacturer: string;
  unitPriceCents: number;
  quantity: number;
  /**
   * Madalaim lubatud ühikuhind marginaalireeglite järgi (pricing engine `minimumAllowedPrice`).
   * null/undefined = ei saa kontrollida (nt ostuhind puudub) — rida loetakse "kontrollimata".
   */
  minimumUnitPriceCents?: number | null;
}

export type DiscountFailureReason =
  | "INVALID_CODE"
  | "NOT_FOUND"
  | "NOT_ACTIVE"
  | "NOT_STARTED"
  | "EXPIRED"
  | "USAGE_LIMIT_REACHED"
  | "EMPTY_CART"
  | "NO_ELIGIBLE_ITEMS"
  | "MINIMUM_SUBTOTAL"
  | "MARGIN_PROTECTED"
  | "RATE_LIMITED";

export interface DiscountLineAllocation {
  listing: string;
  lineTotalCents: number;
  eligible: boolean;
  discountCents: number;
  /** Soodustust vähendati, et hind ei langeks alla minimaalse lubatud marginaali */
  marginLimited: boolean;
  /** Marginaali ei saanud kontrollida (ostuhind või käibemaksurežiim puudub) */
  marginUnchecked: boolean;
}

export interface DiscountSuccess {
  valid: true;
  code: string;
  type: DiscountType;
  subtotalCents: number;
  eligibleSubtotalCents: number;
  discountAmountCents: number;
  /** Tasuta tarne kehtib (rakendub kassas tarneviisi valikul) */
  freeShipping: boolean;
  /** Toodete summa pärast soodustust (ilma transpordita), alati ≥ 0 */
  totalCents: number;
  allocations: DiscountLineAllocation[];
  marginLimitedCount: number;
  marginUncheckedCount: number;
  /** Maksimumi tõttu vähendatud */
  cappedByMaximum: boolean;
}

export interface DiscountFailure {
  valid: false;
  reason: DiscountFailureReason;
  message: string;
  minimumSubtotalCents?: number;
}

export type DiscountEvaluation = DiscountSuccess | DiscountFailure;

const formatCents = formatEur;

/** Kliendile näidatavad põhjused (eesti keeles, ilma sisemiste detailideta). */
export function discountFailureMessage(reason: DiscountFailureReason, minimumSubtotalCents?: number): string {
  switch (reason) {
    case "INVALID_CODE":
    case "NOT_FOUND":
      return "Sooduskoodi ei leitud.";
    case "NOT_ACTIVE":
    case "USAGE_LIMIT_REACHED":
      return "See sooduskood ei ole hetkel aktiivne.";
    case "NOT_STARTED":
      return "Sooduskood ei ole veel aktiivne.";
    case "EXPIRED":
      return "Sooduskood on aegunud.";
    case "EMPTY_CART":
      return "Ostukorv on tühi.";
    case "NO_ELIGIBLE_ITEMS":
      return "Sooduskood ei kehti ühelegi ostukorvis olevale tootele.";
    case "MINIMUM_SUBTOTAL":
      return `Sooduskoodi kasutamiseks peab ostukorvi summa olema vähemalt ${formatCents(minimumSubtotalCents ?? 0)}.`;
    case "MARGIN_PROTECTED":
      return "Sooduskoodi ei saa ostukorvis olevatele toodetele rakendada.";
    case "RATE_LIMITED":
      return "Liiga palju katseid. Proovi mõne minuti pärast uuesti.";
  }
}

function fail(reason: DiscountFailureReason, minimumSubtotalCents?: number): DiscountFailure {
  return { valid: false, reason, message: discountFailureMessage(reason, minimumSubtotalCents), ...(minimumSubtotalCents !== undefined ? { minimumSubtotalCents } : {}) };
}

/** Tegelik olek antud hetkel. Arhiveeritud/väljalülitatud/mustand on alati ülimuslikud. */
export function effectiveDiscountStatus(rule: Pick<DiscountRule, "status" | "startsAt" | "expiresAt">, now: Date): EffectiveDiscountStatus {
  if (rule.status !== "ACTIVE") return rule.status;
  if (rule.expiresAt && rule.expiresAt.getTime() <= now.getTime()) return "EXPIRED";
  if (rule.startsAt && rule.startsAt.getTime() > now.getTime()) return "SCHEDULED";
  return "ACTIVE";
}

/** Kas soodustus kehtib sellele reale (kehtivusala + välistused). Välistus on alati ülimuslik. */
export function isLineEligible(rule: DiscountRule, line: Pick<DiscountCartLine, "listing" | "productModel" | "manufacturer">): boolean {
  if (rule.excludedListings.includes(line.listing) || rule.excludedProductModels.includes(line.productModel)) return false;
  switch (rule.scope) {
    case "ALL_PRODUCTS":
      return true;
    case "SELECTED_MANUFACTURERS":
      return rule.manufacturers.includes(line.manufacturer);
    case "SELECTED_PRODUCT_MODELS":
      return rule.productModels.includes(line.productModel);
    case "SELECTED_LISTINGS":
      return rule.listings.includes(line.listing);
  }
}

/** Toorsoodustus sobivalt summalt (enne jaotust ja marginaalikaitset). */
export function rawDiscountCents(rule: Pick<DiscountRule, "type" | "value" | "maximumDiscountCents">, eligibleSubtotalCents: number): { amount: number; capped: boolean } {
  let amount: number;
  switch (rule.type) {
    case "PERCENTAGE":
      amount = Math.round((eligibleSubtotalCents * rule.value) / 10_000);
      break;
    case "FIXED_AMOUNT":
      amount = rule.value;
      break;
    case "FREE_SHIPPING":
      return { amount: 0, capped: false };
  }
  let capped = false;
  if (rule.maximumDiscountCents !== null && amount > rule.maximumDiscountCents) {
    amount = rule.maximumDiscountCents;
    capped = true;
  }
  // Soodustus ei ületa kunagi sobivate toodete summat → kokkusumma ei lähe negatiivseks
  return { amount: Math.max(0, Math.min(amount, eligibleSubtotalCents)), capped };
}

/** Jagab summa ridadele proportsionaalselt (suurima jäägi meetod — sentide summa klapib täpselt). */
export function allocateProportionally(amountCents: number, weights: number[]): number[] {
  const total = weights.reduce((a, b) => a + b, 0);
  if (total <= 0 || amountCents <= 0) return weights.map(() => 0);
  const exact = weights.map((w) => (amountCents * w) / total);
  const result = exact.map(Math.floor);
  let remainder = amountCents - result.reduce((a, b) => a + b, 0);
  const order = exact.map((value, index) => ({ index, fraction: value - Math.floor(value) })).sort((a, b) => b.fraction - a.fraction || a.index - b.index);
  for (const { index } of order) {
    if (remainder <= 0) break;
    result[index]++;
    remainder--;
  }
  return result;
}

export function evaluateDiscount(rule: DiscountRule | null, lines: DiscountCartLine[], now: Date): DiscountEvaluation {
  if (!rule) return fail("NOT_FOUND");

  // 1–2. Olek ja kehtivusaeg (serveri aeg)
  const status = effectiveDiscountStatus(rule, now);
  if (status === "DRAFT" || status === "ARCHIVED") return fail("NOT_FOUND");
  if (status === "DISABLED") return fail("NOT_ACTIVE");
  if (status === "SCHEDULED") return fail("NOT_STARTED");
  if (status === "EXPIRED") return fail("EXPIRED");

  // 3. Kasutuspiirang — ainult kinnitatud kasutused; kontrollimine ise ei ole kasutamine
  if (rule.usageLimit !== null && rule.usageCount >= rule.usageLimit) return fail("USAGE_LIMIT_REACHED");

  // 4. Ostukorv
  const validLines = lines.filter((line) => line.quantity > 0 && line.unitPriceCents >= 0);
  if (validLines.length === 0) return fail("EMPTY_CART");
  const lineTotals = validLines.map((line) => line.unitPriceCents * line.quantity);
  const subtotalCents = lineTotals.reduce((a, b) => a + b, 0);

  // 5. Sobivad read
  const eligible = validLines.map((line) => isLineEligible(rule, line));
  const eligibleSubtotalCents = lineTotals.reduce((sum, total, i) => sum + (eligible[i] ? total : 0), 0);
  if (eligibleSubtotalCents === 0) return fail("NO_ELIGIBLE_ITEMS");

  // 6. Miinimumsumma (kogu ostukorvi toodete summa)
  if (rule.minimumSubtotalCents !== null && subtotalCents < rule.minimumSubtotalCents) return fail("MINIMUM_SUBTOTAL", rule.minimumSubtotalCents);

  // 7. Toorsoodustus
  const raw = rawDiscountCents(rule, eligibleSubtotalCents);

  // 8. Jaotus sobivatele ridadele (vajalik tellimuse ridade snapshot'iks ja marginaalikaitseks)
  const shares = allocateProportionally(raw.amount, lineTotals.map((total, i) => (eligible[i] ? total : 0)));

  // 9. Marginaalikaitse: hind ei tohi langeda alla madalaima lubatud hinna
  const allocations: DiscountLineAllocation[] = validLines.map((line, i) => {
    let discountCents = shares[i];
    let marginLimited = false;
    const marginUnchecked = eligible[i] && rule.respectMinimumMargin && (line.minimumUnitPriceCents === null || line.minimumUnitPriceCents === undefined);
    if (eligible[i] && rule.respectMinimumMargin && typeof line.minimumUnitPriceCents === "number") {
      const maxLineDiscount = Math.max(0, line.unitPriceCents - line.minimumUnitPriceCents) * line.quantity;
      if (discountCents > maxLineDiscount) {
        discountCents = maxLineDiscount;
        marginLimited = true;
      }
    }
    return { listing: line.listing, lineTotalCents: lineTotals[i], eligible: eligible[i], discountCents, marginLimited, marginUnchecked };
  });
  const discountAmountCents = allocations.reduce((sum, a) => sum + a.discountCents, 0);
  const marginLimitedCount = allocations.filter((a) => a.marginLimited).length;
  if (rule.type !== "FREE_SHIPPING" && raw.amount > 0 && discountAmountCents === 0 && marginLimitedCount > 0) return fail("MARGIN_PROTECTED");

  // 10. Kokkusumma ei ole kunagi negatiivne
  return {
    valid: true,
    code: rule.code,
    type: rule.type,
    subtotalCents,
    eligibleSubtotalCents,
    discountAmountCents,
    freeShipping: rule.type === "FREE_SHIPPING",
    totalCents: Math.max(0, subtotalCents - discountAmountCents),
    allocations,
    marginLimitedCount,
    marginUncheckedCount: allocations.filter((a) => a.marginUnchecked).length,
    cappedByMaximum: raw.capped,
  };
}

/**
 * Tellimusele salvestatav ajalooline koopia (snapshot). Tellimus EI sõltu hiljem DiscountCode reast:
 * admin võib koodi muuta, välja lülitada või arhiveerida, aga vana tellimus säilitab tolle hetke info.
 */
export interface DiscountSnapshot {
  code: string;
  normalizedCode: string;
  type: DiscountType;
  value: number;
  maximumDiscountCents: number | null;
  minimumSubtotalCents: number | null;
  eligibleSubtotalCents: number;
  discountAmountApplied: number;
  freeShipping: boolean;
  lines: { listing: string; discountCents: number }[];
}

export function buildDiscountSnapshot(rule: DiscountRule, result: DiscountSuccess): DiscountSnapshot {
  return {
    code: rule.code,
    normalizedCode: rule.normalizedCode,
    type: rule.type,
    value: rule.value,
    maximumDiscountCents: rule.maximumDiscountCents,
    minimumSubtotalCents: rule.minimumSubtotalCents,
    eligibleSubtotalCents: result.eligibleSubtotalCents,
    discountAmountApplied: result.discountAmountCents,
    freeShipping: result.freeShipping,
    lines: result.allocations.filter((a) => a.discountCents > 0).map((a) => ({ listing: a.listing, discountCents: a.discountCents })),
  };
}

/** Lühike inimloetav soodustus: "10%", "75 €", "Tasuta tarne", "10% (max 100 €)". */
export function formatDiscountValue(rule: Pick<DiscountRule, "type" | "value" | "maximumDiscountCents">): string {
  switch (rule.type) {
    case "PERCENTAGE": {
      const pct = `${String(rule.value / 100).replace(".", ",")}%`;
      return rule.maximumDiscountCents !== null ? `${pct} (max ${formatCents(rule.maximumDiscountCents)})` : pct;
    }
    case "FIXED_AMOUNT":
      return formatCents(rule.value);
    case "FREE_SHIPPING":
      return "Tasuta tarne";
  }
}

import { BatteryFull, Check, CreditCard, PlugZap, RotateCcw, ShieldCheck, TrendingUp } from "lucide-react";
import { modelFit } from "@/domain/catalog/model-fit";
import { BRAND_NAMES, type CatalogItem } from "@/domain/catalog/types";
import { formatEur } from "@/domain/money/money";
import { AddToCartButton } from "./add-to-cart-button";
import { CompareToggle } from "./compare-toggle";
import { ConditionNotices } from "./condition-notices";
import { GradeExplainer } from "./grade-explainer";
import { PriceTag, VatNote } from "./price-tag";
import { StockFreshness } from "./stock-freshness";
import { StockStatus } from "./stock-status";

/**
 * Tootelehe infoala osad. Leht (toode/[slug]/page.tsx) paigutab need desktopis vasakusse veergu
 * (galerii paremal) ja mobiilis eraldi järjekorda: pealkiri → galerii → ost → valikud → andmed.
 */

/** Tootja + seeria, nimi, seisukord ja tarnija märkus. */
export function ProductHeading({ item }: { item: CatalogItem }) {
  const { product, variant } = item;
  return (
    <div>
      <p className="text-sm font-semibold text-primary">
        {BRAND_NAMES[product.brand]} {product.series}
      </p>
      <h1 className="mt-1 text-balance text-2xl font-bold tracking-tight sm:text-3xl">{product.title}</h1>
      <div className="mt-3">
        <GradeExplainer grade={variant.grade} />
      </div>
      <ConditionNotices notices={variant.details.conditionNotices} className="mt-3" />
      {variant.conditionNotes && (
        <p className="mt-2 whitespace-pre-line text-sm text-muted">
          <span className="font-medium text-text">Märkus: </span>
          {variant.conditionNotes}
        </p>
      )}
    </div>
  );
}

/**
 * Hind, laoseis + tarne, ostunupp ja kinnitused. Iga väide (garantii, laadija, tagastus) tuleb andmetest;
 * kui väärtust pole, rida ei kuvata.
 */
export function PurchasePanel({ item, showSecurePayment }: { item: CatalogItem; showSecurePayment: boolean }) {
  const { variant } = item;
  const inStock = variant.stock.available;

  const assurances = [
    variant.warrantyMonths && { icon: ShieldCheck, text: `Garantii ${variant.warrantyMonths} kuud` },
    variant.details.batteryWarrantyMonths && { icon: BatteryFull, text: `Aku garantii ${variant.details.batteryWarrantyMonths} kuud` },
    { icon: RotateCcw, text: "14-päevane taganemisõigus" },
    // Foxway: "Laadija kaasas" / "Originaalkarp ja laadija kaasas" (Unboxed puhul lisame laadija ise)
    variant.chargerIncluded === true && { icon: PlugZap, text: variant.details.chargerLabel ?? "Laadija komplektis" },
    showSecurePayment && { icon: CreditCard, text: "Turvaline maksmine" },
  ].filter((a): a is { icon: typeof ShieldCheck; text: string } => Boolean(a));

  return (
    <section aria-label="Hind ja ostmine" className="space-y-4 rounded-xl border border-border bg-surface p-5 shadow-sm">
      <div>
        <PriceTag price={variant.price} size="xl" />
        <VatNote className="mt-1" />
      </div>
      <div className="space-y-1">
        <StockStatus variant={variant} />
        <StockFreshness lastSyncedAt={variant.lastSyncedAt} />
      </div>
      <AddToCartButton variantId={variant.id} disabled={!inStock} size="lg" fullWidth label="Lisa ostukorvi" />
      <CompareToggle variantId={variant.id} />
      {assurances.length > 0 && (
        <ul className="grid gap-2 border-t border-border pt-4 text-sm sm:grid-cols-2">
          {assurances.map(({ icon: Icon, text }) => (
            <li key={text} className="flex items-center gap-2">
              <Icon className="size-4 shrink-0 text-primary" aria-hidden />
              {text}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/** "Miks valida see mudel?" — deterministlikud spetsifikatsioonireeglid (domain/catalog/model-fit.ts). */
export function ModelFitPanel({ item }: { item: CatalogItem }) {
  const fit = modelFit(item);
  if (!fit) return null;
  return (
    <section aria-labelledby="miks-see-mudel" className="rounded-xl border border-border bg-surface-alt p-5">
      <h2 id="miks-see-mudel" className="text-base font-semibold">
        Miks valida see mudel?
      </h2>
      <p className="mt-3 text-xs font-semibold uppercase tracking-wide text-muted">Sobib hästi</p>
      <ul className="mt-1.5 space-y-1 text-sm">
        {fit.goodFor.map((text) => (
          <li key={text} className="flex gap-2">
            <Check className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
            {text}
          </li>
        ))}
      </ul>
      {fit.considerStronger.length > 0 && (
        <>
          <p className="mt-4 text-xs font-semibold uppercase tracking-wide text-muted">Vaata võimsamat varianti, kui</p>
          <ul className="mt-1.5 space-y-1 text-sm text-body">
            {fit.considerStronger.map((text) => (
              <li key={text} className="flex gap-2">
                <TrendingUp className="mt-0.5 size-4 shrink-0 text-muted" aria-hidden />
                {text}
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}

/** Mobiilis ekraani allservas kleepuv hind + ostunupp. */
export function StickyBuyBar({ item }: { item: CatalogItem }) {
  const { product, variant } = item;
  return (
    <div data-sticky-cta className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-surface/95 px-4 py-3 backdrop-blur lg:hidden">
      <div className="mx-auto flex max-w-xl items-center gap-3">
        <div className="min-w-0 flex-1">
          <p className="truncate text-xs text-muted">{product.title}</p>
          <p className="tabular text-xl font-bold">{formatEur(variant.price.saleCents)}</p>
        </div>
        <AddToCartButton variantId={variant.id} disabled={!variant.stock.available} size="lg" />
      </div>
    </div>
  );
}

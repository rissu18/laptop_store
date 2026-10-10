import { CreditCard, PlugZap, RotateCcw, ShieldCheck } from "lucide-react";
import { BRAND_NAMES, type CatalogItem, type CatalogVariant } from "@/domain/catalog/types";
import { formatEur } from "@/domain/money/money";
import { AddToCartButton } from "./add-to-cart-button";
import { CompareToggle } from "./compare-toggle";
import { GradeExplainer } from "./grade-explainer";
import { PriceTag, VatNote } from "./price-tag";
import { QuickSpecs } from "./quick-specs";
import { StockFreshness } from "./stock-freshness";
import { StockStatus } from "./stock-status";
import { VariantPicker } from "./variant-picker";

/**
 * Ostuplokk. Iga väide (garantii, laadija, tagastus) tuleb andmetest;
 * kui väärtust pole, rida ei kuvata.
 */
export function BuyBox({
  item,
  variants,
  showSecurePayment,
}: {
  item: CatalogItem;
  variants: CatalogVariant[];
  showSecurePayment: boolean;
}) {
  const { product, variant } = item;
  const inStock = variant.stock.quantity > 0;

  const assurances = [
    variant.warrantyMonths && { icon: ShieldCheck, text: `Garantii ${variant.warrantyMonths} kuud` },
    { icon: RotateCcw, text: "14-päevane taganemisõigus" },
    variant.chargerIncluded === true && { icon: PlugZap, text: "Laadija komplektis" },
    showSecurePayment && { icon: CreditCard, text: "Turvaline maksmine" },
  ].filter((a): a is { icon: typeof ShieldCheck; text: string } => Boolean(a));

  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm font-semibold text-primary">
          {BRAND_NAMES[product.brand]} {product.series}
        </p>
        <h1 className="mt-1 text-balance text-2xl font-bold tracking-tight sm:text-3xl">{product.title}</h1>
        <div className="mt-3">
          <GradeExplainer grade={variant.grade} />
        </div>
      </div>

      <QuickSpecs item={item} />

      <VariantPicker product={product} variants={variants} selectedId={variant.id} />

      <div className="space-y-4 rounded-lg border border-border p-5">
        <div>
          <PriceTag price={variant.price} size="xl" />
          <VatNote scheme={variant.price.vatScheme} className="mt-1" />
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
      </div>
    </div>
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
        <AddToCartButton variantId={variant.id} disabled={variant.stock.quantity < 1} size="lg" />
      </div>
    </div>
  );
}

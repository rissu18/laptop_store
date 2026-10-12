import Link from "next/link";
import { formatDisplaySummary, formatKeyboard, formatStorage } from "@/domain/catalog/format";
import { productHref } from "@/domain/catalog/urls";
import { cardImageView, imagesForDisplay } from "@/domain/images/product-image";
import type { CatalogItem } from "@/domain/catalog/types";
import { ButtonLink } from "@/components/ui/button";
import { AddToCartButton } from "./add-to-cart-button";
import { CompareToggle } from "./compare-toggle";
import { ConditionNoticeLine } from "./condition-notices";
import { GradeBadge } from "./grade-badge";
import { PriceTag } from "./price-tag";
import { ProductBadges } from "./product-badges";
import { hasImageNavigation } from "./card-gallery-logic";
import { ProductCardImages } from "./product-card-images";
import { ProductImage } from "./product-image";
import { StockStatus } from "./stock-status";

/**
 * Tootekaart. Annab piisavalt infot, et toodet ei peaks avama:
 * protsessor, RAM, SSD, ekraan, seisukord, klaviatuur, hind, laoseis, tarne.
 * Kogu kaart on klikitav (venitatud link), nupud töötavad eraldi.
 */
export function ProductCard({ item, priority }: { item: CatalogItem; priority?: boolean }) {
  const { product, variant } = item;
  const href = productHref(item);
  // Brauserisse ainult kaardi kasutatud pildi-URL-id (vt cardImageView)
  const images = imagesForDisplay(item).map(cardImageView);
  const imageSizes = "(min-width: 1280px) 330px, (min-width: 640px) 45vw, 100vw";
  const extras = [variant.keyboardLayout && formatKeyboard(variant.keyboardLayout), variant.os?.replace(/ Pro$/, "")].filter(Boolean);

  return (
    <article className="group relative flex w-full flex-col overflow-hidden rounded-xl border border-border bg-surface shadow-sm transition-[box-shadow,border-color] hover:border-primary-border hover:shadow-md">
      <div className="relative">
        {hasImageNavigation(images.length) ? (
          <ProductCardImages images={images} href={href} title={product.title} screenSizeIn={product.screenSizeIn} sizes={imageSizes} priority={priority} />
        ) : (
          <ProductImage item={item} sizes={imageSizes} priority={priority} />
        )}
        <ProductBadges
          firstSeenAt={variant.firstSeenAt}
          stockQuantity={variant.stock.quantity}
          hasPriceDrop={variant.price.referenceCents !== null && variant.price.referenceCents > variant.price.saleCents}
          className="absolute left-3 top-3 z-20"
        />
        <CompareToggle variantId={variant.id} className="absolute right-3 top-3 z-20 rounded-md bg-surface/90 px-2 py-1 shadow-sm" />
      </div>

      <div className="flex flex-1 flex-col gap-3 p-4">
        <h3 className="text-base font-semibold leading-snug">
          <Link href={href} className="after:absolute after:inset-0 after:content-[''] hover:text-primary">
            {product.title}
          </Link>
        </h3>

        <ul className="space-y-0.5 text-sm">
          <li className="font-medium">{variant.cpu.model}</li>
          <li className="font-medium text-body">
            {variant.ramGb} GB RAM · {formatStorage(variant.storageGb)} SSD
          </li>
          <li className="text-muted">{formatDisplaySummary(item)}</li>
        </ul>

        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <GradeBadge grade={variant.grade} size="sm" />
          {extras.length > 0 && <span className="text-xs text-muted">{extras.join(" · ")}</span>}
        </div>
        <ConditionNoticeLine notices={variant.details.conditionNotices} />

        <div className="mt-auto space-y-2 pt-1">
          <PriceTag price={variant.price} />
          <StockStatus variant={variant} />
        </div>

        <div className="flex gap-2">
          <AddToCartButton variantId={variant.id} disabled={!variant.stock.available} className="flex-1" />
          <ButtonLink href={href} variant="outline" className="relative z-10 shrink-0" aria-label={`Vaata lähemalt: ${product.title}`}>
            Vaata
          </ButtonLink>
        </div>
      </div>
    </article>
  );
}

export function ProductGrid({ items, priorityCount = 0, className }: { items: CatalogItem[]; priorityCount?: number; className?: string }) {
  return (
    <ul className={className ?? "grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4"}>
      {items.map((item, index) => (
        <li key={item.variant.id} className="flex">
          <ProductCard item={item} priority={index < priorityCount} />
        </li>
      ))}
    </ul>
  );
}

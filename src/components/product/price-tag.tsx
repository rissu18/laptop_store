import { formatEur } from "@/domain/money/money";
import type { CatalogVariant } from "@/domain/catalog/types";
import { cx } from "@/components/ui/class-names";

/**
 * Hind. Varasem hind kuvatakse AINULT siis, kui see on päris (hinnaajaloost) ja kõrgem.
 */
export function PriceTag({ price, size = "md", className }: { price: CatalogVariant["price"]; size?: "md" | "lg" | "xl"; className?: string }) {
  const hasReference = price.referenceCents !== null && price.referenceCents > price.saleCents;
  return (
    <div className={cx("flex flex-wrap items-baseline gap-x-2", className)}>
      <span
        className={cx(
          "tabular font-bold tracking-tight",
          hasReference ? "text-deal" : "text-text",
          size === "md" && "text-2xl",
          size === "lg" && "text-3xl",
          size === "xl" && "text-4xl",
        )}
      >
        {formatEur(price.saleCents)}
      </span>
      {hasReference && (
        <span className="tabular text-sm text-muted line-through">
          <span className="sr-only">Varasem hind </span>
          {formatEur(price.referenceCents!)}
        </span>
      )}
    </div>
  );
}

/** Käibemaksu märge — ainult siis, kui käsitlus on teada (vt PROJECT_PLAN.md R1). */
export function VatNote({ scheme, className }: { scheme: CatalogVariant["price"]["vatScheme"]; className?: string }) {
  if (scheme === "UNKNOWN") return null;
  return (
    <p className={cx("text-xs text-muted", className)}>
      {scheme === "STANDARD" ? "Hind sisaldab käibemaksu" : "Kasutatud kauba erikord – käibemaksu arvel eraldi ei näidata"}
    </p>
  );
}

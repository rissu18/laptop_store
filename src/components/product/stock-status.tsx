import { Truck } from "lucide-react";
import { stockLabel } from "@/domain/catalog/availability";
import { formatDeliveryDays } from "@/domain/catalog/format";
import type { CatalogVariant } from "@/domain/catalog/types";
import { cx } from "@/components/ui/class-names";

/**
 * Laoseis + tarneaeg.
 * Kõik kaubad on partneri (hulgilao) laos — me ei väida, et kaup on "meie laos".
 * Kui tarnija täpset kogust ei anna (nt Laptopid.ee), kuvatakse "Kohe saadaval" — mitte "1 tk".
 */
export function StockStatus({ variant, compact, className }: { variant: CatalogVariant; compact?: boolean; className?: string }) {
  const inStock = variant.stock.available;
  return (
    <div className={cx("space-y-1 text-sm", className)}>
      <p className="flex items-center gap-2">
        <span className={cx("size-2 shrink-0 rounded-full", inStock ? "bg-success" : "bg-danger")} aria-hidden />
        <span className={cx("font-medium", inStock ? "text-success" : "text-danger")}>{stockLabel(variant.stock)}</span>
      </p>
      {inStock && variant.delivery && (
        <p className="flex items-center gap-2 text-muted">
          <Truck className="size-4 shrink-0" aria-hidden />
          {compact ? "" : "Tarne "}
          {formatDeliveryDays(variant.delivery.minDays, variant.delivery.maxDays)}
        </p>
      )}
    </div>
  );
}

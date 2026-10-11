import Link from "next/link";
import { formatStorage } from "@/domain/catalog/format";
import { gradeDisplay } from "@/domain/grade/grades";
import { productHref } from "@/domain/catalog/urls";
import { formatEur } from "@/domain/money/money";
import type { CatalogProduct, CatalogVariant } from "@/domain/catalog/types";
import { cx } from "@/components/ui/class-names";

/**
 * Sama mudeli saadaolevad konfiguratsioonid. Iga valik on link (töötab ka ilma JS-ita),
 * URL-i parameeter määrab valitud konfiguratsiooni; canonical jääb mudelilehele.
 */
export function VariantPicker({ product, variants, selectedId }: { product: CatalogProduct; variants: CatalogVariant[]; selectedId: string }) {
  if (variants.length < 2) return null;
  return (
    <fieldset>
      <legend className="mb-2 text-sm font-semibold">
        Saadaval {variants.length} konfiguratsiooni
      </legend>
      <ul className="grid gap-2">
        {variants.map((variant) => {
          const selected = variant.id === selectedId;
          return (
            <li key={variant.id}>
              <Link
                href={productHref({ product, variant })}
                replace
                scroll={false}
                aria-current={selected ? "true" : undefined}
                className={cx(
                  "flex items-center justify-between gap-3 rounded-md border px-3 py-2.5 text-sm transition-colors",
                  selected ? "border-primary bg-primary-soft ring-1 ring-primary" : "border-border hover:border-border-strong",
                )}
              >
                <span className="min-w-0">
                  <span className="block font-medium">
                    {variant.cpu.model.replace(/^(Intel|AMD)\s+(Core\s+)?/, "")} · {variant.ramGb} GB · {formatStorage(variant.storageGb)}
                  </span>
                  <span className="block text-xs text-muted">
                    Seisukord {gradeDisplay(variant.grade)}
                    {variant.keyboardLayout && ` · ${variant.keyboardLayout}`}
                    {variant.display.touch && " · Puuteekraan"}
                  </span>
                </span>
                <span className="tabular shrink-0 font-bold">{formatEur(variant.price.saleCents)}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </fieldset>
  );
}

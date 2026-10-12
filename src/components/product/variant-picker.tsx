import Link from "next/link";
import { formatStorage } from "@/domain/catalog/format";
import { gradeDisplay } from "@/domain/grade/grades";
import { productHref } from "@/domain/catalog/urls";
import { formatEur } from "@/domain/money/money";
import type { CatalogProduct, CatalogVariant } from "@/domain/catalog/types";
import { cx } from "@/components/ui/class-names";

/** Rohkem kui 6 konfiguratsiooni → 4 nähtaval (valitud alati), ülejäänud "Näita kõiki" all — hind ja ostunupp jäävad lähedale. */
const COLLAPSE_AFTER = 6;
const VISIBLE_WHEN_COLLAPSED = 4;

function VariantOption({ product, variant, selected }: { product: CatalogProduct; variant: CatalogVariant; selected: boolean }) {
  return (
    <li>
      <Link
        href={productHref({ product, variant })}
        replace
        scroll={false}
        aria-current={selected ? "true" : undefined}
        className={cx(
          "flex items-center justify-between gap-3 rounded-md border px-3 py-2.5 text-sm transition-colors",
          selected ? "border-primary bg-primary-soft ring-1 ring-primary" : "border-border bg-surface hover:border-primary-border",
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
}

/**
 * Sama mudeli saadaolevad konfiguratsioonid. Iga valik on link (töötab ka ilma JS-ita),
 * URL-i parameeter määrab valitud konfiguratsiooni; canonical jääb mudelilehele.
 * Pikk nimekiri on osaliselt kokku volditud (natiivne <details>, töötab ilma JS-ita).
 */
export function VariantPicker({ product, variants, selectedId }: { product: CatalogProduct; variants: CatalogVariant[]; selectedId: string }) {
  if (variants.length < 2) return null;
  const selectedIndex = variants.findIndex((v) => v.id === selectedId);
  const visible =
    variants.length <= COLLAPSE_AFTER
      ? variants
      : selectedIndex < VISIBLE_WHEN_COLLAPSED
        ? variants.slice(0, VISIBLE_WHEN_COLLAPSED)
        : [...variants.slice(0, VISIBLE_WHEN_COLLAPSED - 1), variants[selectedIndex]];
  const hidden = variants.filter((v) => !visible.includes(v));

  return (
    <fieldset>
      <legend className="mb-2 text-base font-semibold">Saadaval {variants.length} konfiguratsiooni</legend>
      <ul className="grid gap-2">
        {visible.map((variant) => (
          <VariantOption key={variant.id} product={product} variant={variant} selected={variant.id === selectedId} />
        ))}
      </ul>
      {hidden.length > 0 && (
        <details className="group mt-2">
          <summary className="flex min-h-11 cursor-pointer list-none items-center justify-center rounded-md border border-dashed border-border-strong bg-surface text-sm font-semibold text-primary hover:border-primary [&::-webkit-details-marker]:hidden">
            <span className="group-open:hidden">
              Näita kõiki {variants.length} konfiguratsiooni (+{hidden.length})
            </span>
            <span className="hidden group-open:inline">Peida lisakonfiguratsioonid</span>
          </summary>
          <ul className="mt-2 grid gap-2">
            {hidden.map((variant) => (
              <VariantOption key={variant.id} product={product} variant={variant} selected={false} />
            ))}
          </ul>
        </details>
      )}
    </fieldset>
  );
}

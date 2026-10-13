import Link from "next/link";
import { Fragment } from "react";
import { IN_STORE_LABEL, configurationDetails, configurationSpecLine } from "@/domain/catalog/configuration-line";
import { productHref } from "@/domain/catalog/urls";
import { formatEur } from "@/domain/money/money";
import type { CatalogProduct, CatalogVariant } from "@/domain/catalog/types";
import { cx } from "@/components/ui/class-names";

function VariantOption({ product, variant, selected }: { product: CatalogProduct; variant: CatalogVariant; selected: boolean }) {
  return (
    <li>
      <Link
        href={productHref({ product, variant })}
        replace
        scroll={false}
        // Palju konfiguratsioone → ei eellaadi kõiki lehti (tooteleht jääb kiireks)
        prefetch={false}
        aria-current={selected ? "true" : undefined}
        className={cx(
          "flex items-center justify-between gap-3 rounded-md border px-3 py-2.5 text-sm transition-colors",
          selected ? "border-primary bg-primary-soft ring-1 ring-primary" : "border-border bg-surface hover:border-primary-border",
        )}
      >
        <span className="min-w-0">
          <span className="block font-medium">{configurationSpecLine(variant)}</span>
          <span className="block text-xs text-muted">
            {configurationDetails(product, variant).map((part, index) => (
              <Fragment key={index}>
                {index > 0 && " · "}
                {/* Salongis olemas → rõhutatud (need konfiguratsioonid on ka nimekirjas eespool) */}
                {part === IN_STORE_LABEL ? <strong className="font-semibold text-text">{part}</strong> : part}
              </Fragment>
            ))}
          </span>
        </span>
        <span className="tabular shrink-0 font-bold">{formatEur(variant.price.saleCents)}</span>
      </Link>
    </li>
  );
}

/**
 * Sama mudeli saadaolevad konfiguratsioonid — alati KÕIK nähtaval (ühtegi ei peideta).
 * Iga valik on link (töötab ka ilma JS-ita), URL-i parameeter määrab valitud konfiguratsiooni; canonical jääb
 * mudelilehele. Rida: CPU · RAM · SSD, alarida: seisukord · klaviatuur · ekraan · resolutsioon · tarneaeg.
 */
export function VariantPicker({ product, variants, selectedId }: { product: CatalogProduct; variants: CatalogVariant[]; selectedId: string }) {
  if (variants.length < 2) return null;
  return (
    <fieldset>
      <legend className="mb-2 text-base font-semibold">Saadaval {variants.length} konfiguratsiooni</legend>
      <ul className="grid gap-2">
        {variants.map((variant) => (
          <VariantOption key={variant.id} product={product} variant={variant} selected={variant.id === selectedId} />
        ))}
      </ul>
    </fieldset>
  );
}

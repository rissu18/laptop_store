"use client";

import { X } from "lucide-react";
import Link from "next/link";
import { useEffect, useState, useTransition, type ReactNode } from "react";
import { removeFromCompare, useCompare } from "@/client/compare-store";
import { cpuGenerationLabel } from "@/domain/catalog/facets";
import { FEATURE_LABELS } from "@/domain/catalog/features";
import { formatDeliveryDays, formatScreenSize, formatStorage, formatWeight } from "@/domain/catalog/format";
import { productHref } from "@/domain/catalog/urls";
import type { CatalogItem } from "@/domain/catalog/types";
import { formatEur } from "@/domain/money/money";
import { resolveCompare } from "@/server/cart/cart-actions";
import { AddToCartButton } from "@/components/product/add-to-cart-button";
import { GradeBadge } from "@/components/product/grade-badge";
import { ProductImage } from "@/components/product/product-image";
import { ButtonLink } from "@/components/ui/button";
import { cx } from "@/components/ui/class-names";

interface Row {
  label: string;
  /** Võrdlusväärtus "Näita ainult erinevusi" jaoks */
  value: (item: CatalogItem) => string;
  render?: (item: CatalogItem) => ReactNode;
}

const yesNo = (value: boolean | null) => (value === null ? "–" : value ? "Jah" : "Ei");

const ROWS: Row[] = [
  { label: "Hind", value: (i) => formatEur(i.variant.price.saleCents), render: (i) => <strong className="tabular text-base">{formatEur(i.variant.price.saleCents)}</strong> },
  { label: "Seisukord", value: (i) => i.variant.grade, render: (i) => <GradeBadge grade={i.variant.grade} size="sm" /> },
  { label: "Protsessor", value: (i) => i.variant.cpu.model },
  { label: "CPU põlvkond", value: (i) => (i.variant.cpu.generationKey ? cpuGenerationLabel(i.variant.cpu.generationKey) : "–") },
  { label: "Mälu (RAM)", value: (i) => `${i.variant.ramGb} GB${i.variant.ramType ? ` ${i.variant.ramType}` : ""}` },
  { label: "SSD", value: (i) => formatStorage(i.variant.storageGb) },
  { label: "Graafika", value: (i) => i.variant.gpu.model },
  { label: "Ekraan", value: (i) => [formatScreenSize(i.product.screenSizeIn), i.variant.display.panel].filter(Boolean).join(" ") },
  { label: "Resolutsioon", value: (i) => i.variant.display.resolution?.replace("x", " × ") ?? "–" },
  { label: "Kaal", value: (i) => (i.product.weightKg ? formatWeight(i.product.weightKg) : "–") },
  { label: "Puuteekraan", value: (i) => yesNo(i.variant.display.touch) },
  { label: "Klaviatuur", value: (i) => i.variant.keyboardLayout ?? "–" },
  { label: "Numbriklahvistik", value: (i) => yesNo(i.variant.features.numpad) },
  { label: "Thunderbolt", value: (i) => yesNo(i.variant.features.thunderbolt) },
  { label: FEATURE_LABELS.smartcard, value: (i) => yesNo(i.variant.features.smartcard) },
  { label: "Garantii", value: (i) => (i.variant.warrantyMonths ? `${i.variant.warrantyMonths} kuud` : "–") },
  { label: "Tarne", value: (i) => (i.variant.delivery ? formatDeliveryDays(i.variant.delivery.minDays, i.variant.delivery.maxDays) : "–") },
];

export function CompareTable() {
  const ids = useCompare();
  const [items, setItems] = useState<CatalogItem[] | null>(null);
  const [onlyDifferences, setOnlyDifferences] = useState(false);
  const [, startTransition] = useTransition();
  const key = ids.join(",");

  useEffect(() => {
    startTransition(async () => setItems(await resolveCompare(ids)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  if (!items) return <div className="h-64 animate-pulse rounded-lg bg-surface-sunken" aria-label="Laen võrdlust" />;

  if (items.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-border-strong px-6 py-16 text-center">
        <h2 className="text-lg font-semibold">Võrdluses pole veel tooteid</h2>
        <p className="mt-1 text-sm text-muted">Märgi tootekaardil „Võrdle“ — võrrelda saab kuni 4 sülearvutit.</p>
        <ButtonLink href="/sulearvutid" className="mt-6">
          Vaata sülearvuteid
        </ButtonLink>
      </div>
    );
  }

  const rows = onlyDifferences ? ROWS.filter((row) => new Set(items.map(row.value)).size > 1) : ROWS;

  // Mobiilis: omaduse veerg jääb paigale (sticky), toodete veerud on fikseeritud laiusega ja keritavad
  // külgsuunas ainult tabeli sees — leht ise ei lähe laiemaks kui ekraan.
  const stickyCell = "sticky left-0 z-10 bg-surface shadow-[6px_0_6px_-6px_rgb(17_24_39/0.25)] sm:shadow-none";

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <label className="inline-flex cursor-pointer items-center gap-2 text-sm font-medium">
          <input type="checkbox" checked={onlyDifferences} onChange={(e) => setOnlyDifferences(e.target.checked)} className="size-5 accent-[var(--c-primary)]" />
          Näita ainult erinevusi
        </label>
        {items.length > 1 && (
          <p className="text-xs text-muted sm:hidden" aria-hidden>
            Keri tabelit külgsuunas →
          </p>
        )}
      </div>

      {onlyDifferences && rows.length === 0 && <p className="mb-4 text-sm text-muted">Valitud toodetel pole erinevusi.</p>}

      <div className="relative -mx-4 sm:mx-0">
        <div className="overflow-x-auto overscroll-x-contain px-4 sm:px-0">
          <table className="w-max border-separate border-spacing-0 text-[13px] sm:w-full sm:table-fixed sm:text-sm">
            <caption className="sr-only">Toodete võrdlus</caption>
            <thead>
              <tr>
                <th scope="col" className={cx(stickyCell, "w-[96px] min-w-[96px] sm:w-40")}>
                  <span className="sr-only">Omadus</span>
                </th>
                {items.map((item) => (
                  <th key={item.variant.id} scope="col" className="w-[150px] min-w-[150px] p-2 text-left align-top font-normal sm:w-auto">
                    <div className="relative">
                      <button
                        type="button"
                        onClick={() => removeFromCompare(item.variant.id)}
                        className="absolute right-1 top-1 z-10 flex size-8 items-center justify-center rounded-full bg-surface shadow-sm hover:text-danger"
                        aria-label={`Eemalda võrdlusest: ${item.product.title}`}
                      >
                        <X className="size-4" aria-hidden />
                      </button>
                      <ProductImage item={item} sizes="(min-width: 640px) 220px, 150px" className="rounded-md" />
                      <Link href={productHref(item)} className="mt-2 line-clamp-3 block font-semibold leading-snug hover:text-primary">
                        {item.product.title}
                      </Link>
                      <AddToCartButton
                        variantId={item.variant.id}
                        size="sm"
                        fullWidth
                        className="mt-2 px-2"
                        disabled={item.variant.stock.quantity < 1}
                      />
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.label}>
                  <th scope="row" className={cx(stickyCell, "border-t border-border py-3 pr-3 text-left align-top font-medium text-muted")}>
                    {row.label}
                  </th>
                  {items.map((item) => (
                    <td key={item.variant.id} className="break-words border-t border-border p-2 py-3 align-top">
                      {row.render ? row.render(item) : row.value(item)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

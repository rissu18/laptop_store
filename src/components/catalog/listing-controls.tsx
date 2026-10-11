"use client";

import { ArrowUpDown, SlidersHorizontal, X } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { FACETS, MULTI_FACET_KEYS, type MultiFacetKey } from "@/domain/catalog/facets";
import { FEATURE_LABELS } from "@/domain/catalog/features";
import type { CatalogFacets } from "@/domain/catalog/filtering";
import {
  SORT_OPTIONS,
  clearFilters,
  countActiveFilters,
  toggleFacetValue,
  toggleFeature,
  withPage,
  withPriceRange,
  withSort,
  type CatalogQuery,
  type SortKey,
} from "@/domain/catalog/query";
import type { FeatureKey } from "@/domain/catalog/types";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { cx } from "@/components/ui/class-names";
import { useCatalogNavigation } from "./catalog-navigation";
import { FilterPanel } from "./filter-panel";

// ---- Sorteerimine ------------------------------------------------------------

export function SortSelect({ query, className }: { query: CatalogQuery; className?: string }) {
  const { navigate } = useCatalogNavigation();
  return (
    <label className={cx("relative flex items-center", className)}>
      <span className="sr-only">Sorteeri</span>
      <ArrowUpDown className="pointer-events-none absolute left-3 size-4 text-muted" aria-hidden />
      <select
        value={query.sort}
        onChange={(event) => navigate(withSort(query, event.target.value as SortKey))}
        className="h-10 w-full appearance-none rounded-md border border-border-strong bg-surface pl-9 pr-8 text-sm font-medium"
      >
        {SORT_OPTIONS.map((option) => (
          <option key={option.key} value={option.key}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}

// ---- Mobiili filtri-drawer ------------------------------------------------------

export function FilterDrawer({ query, facets, total }: { query: CatalogQuery; facets: CatalogFacets; total: number }) {
  const { locked, isPending } = useCatalogNavigation();
  const [open, setOpen] = useState(false);
  const active = countActiveFilters(query, locked);

  return (
    <>
      <Button variant="outline" onClick={() => setOpen(true)} className="flex-1 lg:hidden" aria-haspopup="dialog">
        <SlidersHorizontal className="size-4" aria-hidden />
        Filtrid{active > 0 && ` (${active})`}
      </Button>
      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title="Filtrid"
        variant="sheet"
        footer={
          <Button fullWidth size="lg" onClick={() => setOpen(false)} disabled={isPending}>
            {isPending ? "Laen…" : `Näita ${total} tulemust`}
          </Button>
        }
      >
        <div className="px-5">
          <FilterPanel query={query} facets={facets} locked={locked} />
        </div>
      </Dialog>
    </>
  );
}

// ---- Aktiivsed filtrid ------------------------------------------------------------

export function ActiveFilters({ query }: { query: CatalogQuery }) {
  const { hrefFor, locked } = useCatalogNavigation();
  const chips: { key: string; label: string; href: string }[] = [];

  if (query.q) chips.push({ key: "q", label: `„${query.q}“`, href: hrefFor({ ...query, q: "", page: 1 }) });
  for (const key of MULTI_FACET_KEYS) {
    if (locked[key]) continue;
    for (const value of query.facets[key]) {
      chips.push({ key: `${key}-${value}`, label: FACETS[key].optionLabel(value), href: hrefFor(toggleFacetValue(query, key, value)) });
    }
  }
  for (const feature of query.features) {
    chips.push({ key: `f-${feature}`, label: FEATURE_LABELS[feature], href: hrefFor(toggleFeature(query, feature)) });
  }
  if (query.minPrice !== null || query.maxPrice !== null) {
    const label =
      query.minPrice !== null && query.maxPrice !== null
        ? `${query.minPrice}–${query.maxPrice} €`
        : query.minPrice !== null
          ? `Alates ${query.minPrice} €`
          : `Kuni ${query.maxPrice} €`;
    chips.push({ key: "price", label, href: hrefFor(withPriceRange(query, null, null)) });
  }

  if (chips.length === 0) return null;

  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="sr-only">Aktiivsed filtrid:</span>
      {chips.map((chip) => (
        <Link
          key={chip.key}
          href={chip.href}
          scroll={false}
          className="inline-flex items-center gap-1 rounded-full bg-primary-soft py-1 pl-3 pr-2 text-sm font-medium text-primary hover:bg-primary hover:text-on-primary"
          aria-label={`Eemalda filter: ${chip.label}`}
        >
          {chip.label}
          <X className="size-3.5" aria-hidden />
        </Link>
      ))}
      <Link href={hrefFor(clearFilters(query))} scroll={false} className="px-2 text-sm font-medium text-muted underline-offset-2 hover:text-text hover:underline">
        Tühjenda kõik
      </Link>
    </div>
  );
}

// ---- Kiirfiltrid ------------------------------------------------------------------

interface QuickChip {
  label: string;
  isActive: (q: CatalogQuery) => boolean;
  toggle: (q: CatalogQuery) => CatalogQuery;
  available: (f: CatalogFacets) => boolean;
}

const facetChip = (label: string, key: MultiFacetKey, value: string): QuickChip => ({
  label,
  isActive: (q) => q.facets[key].includes(value),
  toggle: (q) => toggleFacetValue(q, key, value),
  available: (f) => (f.multi[key].find((o) => o.value === value)?.count ?? 0) > 0,
});

const featureChip = (label: string, feature: FeatureKey): QuickChip => ({
  label,
  isActive: (q) => q.features.includes(feature),
  toggle: (q) => toggleFeature(q, feature),
  available: (f) => f.features.some((o) => o.value === feature && o.count > 0),
});

const QUICK_CHIPS: QuickChip[] = [
  facetChip("16 GB RAM", "ram", "16"),
  facetChip("512 GB SSD", "ssd", "512"),
  facetChip('14"', "screen", "14"),
  {
    label: "Alla 500 €",
    isActive: (q) => q.maxPrice === 500 && q.minPrice === null,
    toggle: (q) => (q.maxPrice === 500 && q.minPrice === null ? withPriceRange(q, null, null) : withPriceRange(q, null, 500)),
    available: (f) => (f.price?.min ?? Infinity) < 500,
  },
  facetChip("A-klass", "grade", "a"),
  featureChip("Kerge", "light"),
  featureChip("Puuteekraan", "touch"),
];

export function QuickFilterChips({ query, facets }: { query: CatalogQuery; facets: CatalogFacets }) {
  const { hrefFor } = useCatalogNavigation();
  const chips = QUICK_CHIPS.filter((chip) => chip.isActive(query) || chip.available(facets));
  if (chips.length === 0) return null;

  return (
    <nav aria-label="Kiirfiltrid" className="-mx-4 overflow-x-auto px-4 [scrollbar-width:none] sm:mx-0 sm:px-0">
      <ul className="flex gap-2 sm:flex-wrap">
        {chips.map((chip) => {
          const active = chip.isActive(query);
          return (
            <li key={chip.label} className="shrink-0">
              <Link
                href={hrefFor(chip.toggle(query))}
                scroll={false}
                aria-pressed={active}
                className={cx(
                  "inline-flex h-9 items-center rounded-full border px-4 text-sm font-medium transition-colors",
                  active ? "border-primary-border bg-primary-soft text-primary" : "border-border-strong bg-surface hover:border-text",
                )}
              >
                {chip.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

// ---- Lehekülgede navigeerimine -------------------------------------------------------

export function Pagination({ query, page, pageCount }: { query: CatalogQuery; page: number; pageCount: number }) {
  const { hrefFor } = useCatalogNavigation();
  if (pageCount <= 1) return null;

  const pages = [...new Set([1, page - 1, page, page + 1, pageCount])].filter((p) => p >= 1 && p <= pageCount).sort((a, b) => a - b);

  return (
    <nav aria-label="Leheküljed" className="mt-10 flex justify-center">
      <ul className="flex items-center gap-1">
        {pages.map((p, index) => (
          <li key={p} className="flex items-center gap-1">
            {index > 0 && p - pages[index - 1] > 1 && <span className="px-1 text-muted">…</span>}
            <Link
              href={hrefFor(withPage(query, p))}
              aria-current={p === page ? "page" : undefined}
              className={cx(
                "tabular flex size-10 items-center justify-center rounded-md text-sm font-medium",
                p === page ? "bg-primary text-on-primary" : "hover:bg-surface-sunken",
              )}
            >
              {p}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}

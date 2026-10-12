"use client";

import { SearchX } from "lucide-react";
import { clearFilters } from "@/domain/catalog/query";
import { ProductGrid } from "@/components/product/product-card";
import { buttonClasses } from "@/components/ui/button";
import { CatalogLink, PendingRegion, RESULTS_ANCHOR_ID, useCatalogNavigation } from "./catalog-navigation";
import { FilterPanel } from "./filter-panel";
import { ActiveFilters, FilterDrawer, Pagination, QuickFilterChips, SortSelect } from "./listing-controls";

/**
 * Tootenimekiri koos filtritega (/sulearvutid ja brändilehed). Andmed tulevad CatalogNavigationProvider'ist:
 * esimene lehekülg serverist, iga filtrimuutus /api/catalog-ist. Uueneb ainult see ala — päis, jalus ja
 * lehe raam jäävad puutumata.
 */
export function CatalogView() {
  const { query, data, locked } = useCatalogNavigation();
  const { items, total, page, pageCount, facets } = data;

  return (
    <div className="lg:grid lg:grid-cols-[260px_minmax(0,1fr)] lg:gap-8">
      <aside aria-label="Filtrid" className="hidden lg:block">
        {/*
          Filtrid kerivad koos lehega (mitte eraldi sisemise kerimisalana): pikk filtrinimekiri on alati
          lõpuni kättesaadav ka siis, kui tulemusi on vähe ja leht ise lühike. pb: võrdlusriba (~80 px) ei kata viimast valikut.
        */}
        <div className="pb-28 pr-2">
          <FilterPanel query={query} facets={facets} locked={locked} />
        </div>
      </aside>

      <div className="min-w-0">
        {/* Mobiilis kleepuv tööriistariba */}
        <div className="sticky top-0 z-30 -mx-4 mt-4 flex gap-2 border-b border-border bg-surface/95 px-4 py-2 backdrop-blur sm:-mx-6 sm:px-6 lg:hidden">
          <FilterDrawer query={query} facets={facets} total={total} />
          <SortSelect query={query} className="flex-1" />
        </div>

        <div id={RESULTS_ANCHOR_ID} className="flex scroll-mt-20 flex-wrap items-center justify-between gap-3 py-4">
          <p className="text-sm text-muted" aria-live="polite">
            <strong className="tabular text-base font-semibold text-text">{total}</strong> {total === 1 ? "sülearvuti" : "sülearvutit"}
          </p>
          <SortSelect query={query} className="hidden w-56 lg:flex" />
        </div>

        <div className="space-y-3 pb-5">
          <QuickFilterChips query={query} facets={facets} />
          <ActiveFilters query={query} />
        </div>

        <PendingRegion>
          {items.length > 0 ? (
            <ProductGrid items={items} priorityCount={2} className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3" />
          ) : (
            <div className="flex flex-col items-center rounded-lg border border-dashed border-border-strong px-6 py-16 text-center">
              <SearchX className="size-10 text-muted" aria-hidden />
              <h2 className="mt-4 text-lg font-semibold">Nende filtritega sülearvuteid ei leitud</h2>
              <p className="mt-1 max-w-md text-sm text-muted">Proovi mõni filter eemaldada või otsingut muuta.</p>
              <CatalogLink query={clearFilters(query)} className={buttonClasses({ variant: "outline" }) + " mt-6"}>
                Tühjenda filtrid
              </CatalogLink>
            </div>
          )}
        </PendingRegion>

        <Pagination query={query} page={page} pageCount={pageCount} />
      </div>
    </div>
  );
}

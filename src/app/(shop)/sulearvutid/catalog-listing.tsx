import { SearchX } from "lucide-react";
import { clearFilters, parseCatalogQuery, type FacetSelection, type RawSearchParams } from "@/domain/catalog/query";
import { buildCatalogHref } from "@/domain/catalog/query";
import { CatalogNavigationProvider, PendingRegion } from "@/components/catalog/catalog-navigation";
import { FilterPanel } from "@/components/catalog/filter-panel";
import { ActiveFilters, FilterDrawer, Pagination, QuickFilterChips, SortSelect } from "@/components/catalog/listing-controls";
import { ProductGrid } from "@/components/product/product-card";
import { ButtonLink } from "@/components/ui/button";
import { listCatalog } from "@/server/catalog/catalog-service";

/**
 * Tootenimekiri koos filtritega. Kasutatakse /sulearvutid ja brändilehtedel.
 * Filtreerimine toimub serveris; brauserisse jõuab ainult üks lehekülg tooteid.
 */
export async function CatalogListing({
  searchParams,
  basePath,
  locked = {},
}: {
  searchParams: Promise<RawSearchParams>;
  basePath: string;
  locked?: Partial<FacetSelection>;
}) {
  const query = parseCatalogQuery(await searchParams);
  const { items, total, page, pageCount, facets } = await listCatalog(query, locked);

  return (
    <CatalogNavigationProvider basePath={basePath} locked={locked}>
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

          <div className="flex flex-wrap items-center justify-between gap-3 py-4">
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
                <ButtonLink href={buildCatalogHref(basePath, clearFilters(query), locked)} variant="outline" className="mt-6">
                  Tühjenda filtrid
                </ButtonLink>
              </div>
            )}
          </PendingRegion>

          <Pagination query={query} page={page} pageCount={pageCount} />
        </div>
      </div>
    </CatalogNavigationProvider>
  );
}

export function CatalogListingSkeleton() {
  return (
    <div className="lg:grid lg:grid-cols-[260px_minmax(0,1fr)] lg:gap-8" aria-hidden>
      <div className="hidden space-y-4 lg:block">
        {Array.from({ length: 6 }, (_, i) => (
          <div key={i} className="h-24 animate-pulse rounded-md bg-surface-sunken" />
        ))}
      </div>
      <div>
        <div className="my-4 h-6 w-40 animate-pulse rounded bg-surface-sunken" />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 6 }, (_, i) => (
            <div key={i} className="h-[480px] animate-pulse rounded-lg bg-surface-sunken" />
          ))}
        </div>
      </div>
    </div>
  );
}

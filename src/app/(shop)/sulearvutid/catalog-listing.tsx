import { toCardItem } from "@/domain/catalog/card";
import { buildCatalogHref, parseCatalogQuery, type FacetSelection, type RawSearchParams } from "@/domain/catalog/query";
import { CatalogNavigationProvider } from "@/components/catalog/catalog-navigation";
import { CatalogView } from "@/components/catalog/catalog-view";
import { listCatalog } from "@/server/catalog/catalog-service";

/**
 * Tootenimekiri koos filtritega. Kasutatakse /sulearvutid ja brändilehtedel.
 * Server renderdab esimese lehekülje (SQL: filtrid + LIMIT 24); edasised filtrimuutused käivad
 * /api/catalog kaudu kliendis (CatalogNavigationProvider). Brauserisse jõuab ainult üks lehekülg kaarte.
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
    // key: kui leht navigeeritakse mujalt uue päringuga (nt päise otsing), algab olek serveri andmetest
    <CatalogNavigationProvider
      key={buildCatalogHref(basePath, query, locked)}
      basePath={basePath}
      locked={locked}
      initialQuery={query}
      initialData={{ items: items.map(toCardItem), total, page, pageCount, facets }}
    >
      <CatalogView />
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

"use client";

import { useRouter } from "next/navigation";
import { createContext, useContext, useTransition, type ReactNode } from "react";
import { buildCatalogHref, type CatalogQuery, type FacetSelection } from "@/domain/catalog/query";
import { cx } from "@/components/ui/class-names";

/**
 * Filtrite olek elab URL-is. Filtri muutmine = navigeerimine uuele URL-ile;
 * server arvutab tulemused ja facet'id. Brauserisse ei saadeta kunagi kogu kataloogi.
 */

interface CatalogNavigation {
  basePath: string;
  locked: Partial<FacetSelection>;
  navigate: (query: CatalogQuery) => void;
  hrefFor: (query: CatalogQuery) => string;
  isPending: boolean;
}

const Context = createContext<CatalogNavigation | null>(null);

export function CatalogNavigationProvider({ basePath, locked, children }: { basePath: string; locked: Partial<FacetSelection>; children: ReactNode }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const hrefFor = (query: CatalogQuery) => buildCatalogHref(basePath, query, locked);

  return (
    <Context.Provider
      value={{
        basePath,
        locked,
        hrefFor,
        isPending,
        navigate: (query) => startTransition(() => router.push(hrefFor(query), { scroll: false })),
      }}
    >
      {children}
    </Context.Provider>
  );
}

export function useCatalogNavigation(): CatalogNavigation {
  const value = useContext(Context);
  if (!value) throw new Error("useCatalogNavigation peab olema CatalogNavigationProvider'i sees");
  return value;
}

/** Tuhmistab tulemused, kuni uus filtreeritud vaade laeb. */
export function PendingRegion({ children, className }: { children: ReactNode; className?: string }) {
  const { isPending } = useCatalogNavigation();
  return (
    <div aria-busy={isPending} className={cx("transition-opacity", isPending && "pointer-events-none opacity-50", className)}>
      {children}
    </div>
  );
}

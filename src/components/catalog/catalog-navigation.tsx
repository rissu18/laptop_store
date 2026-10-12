"use client";

import { createContext, useContext, useEffect, useMemo, useRef, useState, type ComponentProps, type MouseEvent, type ReactNode } from "react";
import type { CatalogFacets } from "@/domain/catalog/filtering";
import { buildCatalogHref, parseCatalogQuery, type CatalogQuery, type FacetSelection, type RawSearchParams } from "@/domain/catalog/query";
import type { CatalogItem } from "@/domain/catalog/types";
import { cx } from "@/components/ui/class-names";

/**
 * Kataloogi filtrite olek (Laptopid.ee vana filtri põhimõte, puhtama teostusega):
 *
 *   filtriklikk → URL uueneb (history.pushState, ilma lehe ja päise/jaluse uuesti renderdamiseta)
 *     → väike GET /api/catalog?… → PostgreSQL filtreerib → 24 kaarti + tahud JSON-ina → uueneb tulemuste ala.
 *
 * - Päring elab URL-is: jagatav link; klikk = history.pushState, tagasi/edasi nupp = popstate → uus päring.
 *   (Olek hoitakse ka Reactis, et järjestikused kiired klikid lähtuksid alati viimasest valikust.)
 * - Võistlusolukord: iga URL-i muutus katkestab eelmise päringu (AbortController), seega aeglane vanem vastus
 *   ei kirjuta kunagi uuemat tulemust üle.
 * - Märkeruut märgitakse kohe (valik tuleb URL-ist); loendurid ja kaardid uuenevad vastuse saabudes.
 * - Brauserisse ei saadeta kunagi kogu kataloogi. Vea korral tehakse tavaline lehe laadimine (vale tulemust ei jää).
 */

export interface CatalogData {
  items: CatalogItem[];
  total: number;
  page: number;
  pageCount: number;
  facets: CatalogFacets;
}

interface CatalogNavigation {
  basePath: string;
  locked: Partial<FacetSelection>;
  /** Praegune päring (URL-ist — muutub kohe kliki järel) */
  query: CatalogQuery;
  /** Viimati laetud tulemused (valikute märgid vastavad juba `query`-le) */
  data: CatalogData;
  navigate: (query: CatalogQuery, options?: { scrollToResults?: boolean }) => void;
  hrefFor: (query: CatalogQuery) => string;
  isPending: boolean;
}

const Context = createContext<CatalogNavigation | null>(null);

export const RESULTS_ANCHOR_ID = "tulemused";

function toRawParams(params: URLSearchParams): RawSearchParams {
  const raw: RawSearchParams = {};
  for (const key of new Set(params.keys())) {
    const values = params.getAll(key);
    raw[key] = values.length > 1 ? values : values[0];
  }
  return raw;
}

/** Tahu valikute märgid päringu järgi (klikk näitab valikut kohe, enne kui uued loendurid saabuvad) */
function withSelection(facets: CatalogFacets, query: CatalogQuery): CatalogFacets {
  const multi = Object.fromEntries(
    Object.entries(facets.multi).map(([key, options]) => [key, options.map((o) => ({ ...o, selected: query.facets[key as keyof FacetSelection].includes(o.value) }))]),
  ) as CatalogFacets["multi"];
  return { ...facets, multi, features: facets.features.map((o) => ({ ...o, selected: query.features.includes(o.value as CatalogQuery["features"][number]) })) };
}

export function CatalogNavigationProvider({
  basePath,
  locked,
  initialQuery,
  initialData,
  children,
}: {
  basePath: string;
  locked: Partial<FacetSelection>;
  initialQuery: CatalogQuery;
  initialData: CatalogData;
  children: ReactNode;
}) {
  const hrefFor = (query: CatalogQuery) => buildCatalogHref(basePath, query, locked);
  const [query, setQuery] = useState(initialQuery);
  const urlKey = buildCatalogHref(basePath, query, locked);
  const [loaded, setLoaded] = useState(() => ({ key: buildCatalogHref(basePath, initialQuery, locked), data: initialData }));
  const scrollAfterLoad = useRef(false);
  const lockedBrand = locked.brand?.[0];

  useEffect(() => {
    if (loaded.key === urlKey) return;
    const controller = new AbortController();
    const search = new URLSearchParams(urlKey.split("?")[1] ?? "");
    if (lockedBrand) search.set("scope", lockedBrand);
    fetch(`/api/catalog?${search}`, { signal: controller.signal })
      .then((response) => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return response.json() as Promise<CatalogData>;
      })
      .then((data) => setLoaded({ key: urlKey, data }))
      .catch(() => {
        // Katkestatud (uuem klikk) → ei tee midagi; muu viga → tavaline lehe laadimine sama URL-iga
        if (!controller.signal.aborted) window.location.assign(urlKey);
      });
    return () => controller.abort();
  }, [urlKey, loaded.key, lockedBrand]);

  // Tagasi/edasi: päring brauseri URL-ist (sama lehe piires)
  useEffect(() => {
    const onPopState = () => {
      if (window.location.pathname !== basePath) return;
      setQuery(parseCatalogQuery(toRawParams(new URLSearchParams(window.location.search))));
    };
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, [basePath]);

  useEffect(() => {
    if (!scrollAfterLoad.current) return;
    scrollAfterLoad.current = false;
    document.getElementById(RESULTS_ANCHOR_ID)?.scrollIntoView({ block: "start" });
  }, [loaded]);

  const data = useMemo(() => ({ ...loaded.data, facets: withSelection(loaded.data.facets, query) }), [loaded.data, query]);

  return (
    <Context.Provider
      value={{
        basePath,
        locked,
        query,
        data,
        hrefFor,
        isPending: loaded.key !== urlKey,
        navigate: (next, options) => {
          const href = hrefFor(next);
          if (href === urlKey) return;
          scrollAfterLoad.current = Boolean(options?.scrollToResults);
          setQuery(next);
          // Native History API on Next.js-iga ühilduv (node_modules/next/dist/docs → Linking and Navigating)
          window.history.pushState(null, "", href);
        },
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

/**
 * Filtri link (kiirfiltrid, aktiivsed filtrid, leheküljed): tavaline <a href> (uus kaart, jagamine, JS-ita töötab),
 * aga tavaline klikk uuendab ainult tulemusi. Next <Link>-i ei kasutata, et iga nähtav filtrilink ei teeks eellaadimist.
 */
export function CatalogLink({
  query,
  scrollToResults,
  onClick,
  ...props
}: Omit<ComponentProps<"a">, "href"> & { query: CatalogQuery; scrollToResults?: boolean }) {
  const { hrefFor, navigate } = useCatalogNavigation();
  return (
    <a
      {...props}
      href={hrefFor(query)}
      onClick={(event: MouseEvent<HTMLAnchorElement>) => {
        onClick?.(event);
        if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
        event.preventDefault();
        navigate(query, { scrollToResults });
      }}
    />
  );
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

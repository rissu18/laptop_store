import type { NextRequest } from "next/server";
import { toCardItem } from "@/domain/catalog/card";
import { parseCatalogQuery, type FacetSelection, type RawSearchParams } from "@/domain/catalog/query";
import { BRAND_CODES, type BrandCode } from "@/domain/catalog/types";
import { listCatalog } from "@/server/catalog/catalog-service";

/**
 * Kataloogi filtri vastus (filtriklikk /sulearvutid lehel): üks lehekülg (24) kaarti + tahud, JSON-ina.
 * Filtreerimine, loendurid ja LIMIT käivad andmebaasis (catalog-queries.ts); brauserisse ei saadeta kogu kataloogi.
 * `scope` = brändilehe lukustatud tootja (/sulearvutid/lenovo). Ainult avalikud kaardi andmed (toCardItem).
 */
export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const raw: RawSearchParams = {};
  for (const key of new Set(params.keys())) {
    const values = params.getAll(key);
    raw[key] = values.length > 1 ? values : values[0];
  }
  const scope = params.get("scope");
  const locked: Partial<FacetSelection> = scope && (BRAND_CODES as readonly string[]).includes(scope) ? { brand: [scope as BrandCode] } : {};

  const { items, total, page, pageCount, facets } = await listCatalog(parseCatalogQuery(raw), locked);
  return Response.json(
    { items: items.map(toCardItem), total, page, pageCount, facets },
    // Laoseis peab olema värske: brauser/CDN ei hoia; serveri vahemälu tühjendab sync (cacheTag 'catalog')
    { headers: { "Cache-Control": "private, no-store" } },
  );
}

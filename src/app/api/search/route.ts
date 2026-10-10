import type { NextRequest } from "next/server";
import { formatSpecLine } from "@/domain/catalog/format";
import { productHref } from "@/domain/catalog/urls";
import { searchSuggestions } from "@/server/catalog/catalog-service";

/** Otsingu autocomplete. Tagastab ainult avalikud andmed (mitte ostuhinda). */
export async function GET(request: NextRequest) {
  const q = (request.nextUrl.searchParams.get("q") ?? "").trim().slice(0, 100);
  if (q.length < 2) return Response.json({ results: [] });

  const items = await searchSuggestions(q, 6);
  return Response.json(
    {
      results: items.map((item) => ({
        href: productHref(item),
        title: item.product.title,
        specs: formatSpecLine(item),
        priceCents: item.variant.price.saleCents,
      })),
    },
    { headers: { "Cache-Control": "public, max-age=60" } },
  );
}

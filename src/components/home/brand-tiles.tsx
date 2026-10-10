import Link from "next/link";
import { seriesLabel } from "@/domain/catalog/facets";
import { formatEur } from "@/domain/money/money";
import type { SeriesSummary } from "@/server/catalog/catalog-service";

/** Brändid/seeriad koos PÄRIS toodete arvuga andmebaasist. */
export function BrandTiles({ series }: { series: SeriesSummary[] }) {
  return (
    <ul className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
      {series.map((item) => (
        <li key={item.slug} className="flex">
          <Link
            href={`/sulearvutid/${item.brand}?series=${item.slug}`}
            className="flex w-full flex-col justify-between gap-4 rounded-lg border border-border bg-surface p-4 transition-colors hover:border-primary"
          >
            <span className="font-semibold leading-tight">{seriesLabel(item.slug)}</span>
            <span className="text-sm text-muted">
              <span className="tabular block font-medium text-text">{item.count} sülearvutit</span>
              alates {formatEur(item.minPriceCents)}
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}

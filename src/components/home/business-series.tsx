import { ChevronRight } from "lucide-react";
import Link from "next/link";
import type { BusinessSeriesGroup } from "@/domain/catalog/business-series";
import { formatEur } from "@/domain/money/money";

/**
 * "Populaarsed äriklassi seeriad" tootjate kaupa. Arvud ja hinnad päris kataloogist; link avab
 * tootja nimekirja sama seeriafiltriga, mida kasutab nimekirja filtripaneel.
 */
export function BusinessSeries({ groups }: { groups: BusinessSeriesGroup[] }) {
  return (
    <ul className="grid gap-4 md:grid-cols-3">
      {groups.map((group) => (
        <li key={group.brand} className="rounded-xl border border-border bg-surface p-2 shadow-sm">
          <h3 className="flex items-baseline justify-between px-3 pb-1 pt-2">
            <span className="text-lg font-bold tracking-tight">{group.brandName}</span>
            <Link href={`/sulearvutid/${group.brand}`} className="text-sm font-semibold text-primary hover:underline">
              Kõik<span className="sr-only"> {group.brandName} sülearvutid</span>
            </Link>
          </h3>
          <ul>
            {group.series.map((series) => (
              <li key={series.value}>
                <Link
                  href={series.href}
                  className="group flex min-h-12 items-center gap-3 rounded-lg px-3 py-2 transition-colors hover:bg-primary-soft"
                >
                  <span className="min-w-0 flex-1">
                    <span className="block font-semibold group-hover:text-primary">{series.label}</span>
                    <span className="tabular block text-xs text-muted">
                      {series.count} sülearvutit · alates {formatEur(series.minPriceCents)}
                    </span>
                  </span>
                  <ChevronRight className="size-4 shrink-0 text-subtle group-hover:text-primary" aria-hidden />
                </Link>
              </li>
            ))}
          </ul>
        </li>
      ))}
    </ul>
  );
}

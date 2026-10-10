import { ChevronLeft, ChevronRight } from "lucide-react";
import Link from "next/link";
import { cx } from "@/components/ui/class-names";

/** Lehekülgede vahel liikumine; säilitab praegused filtrid URL-is. */
export function Pagination({ basePath, params, page, pageCount, total }: { basePath: string; params: Record<string, string | undefined>; page: number; pageCount: number; total: number }) {
  if (pageCount <= 1) return <p className="mt-3 text-sm text-muted">Kokku {total}</p>;
  const href = (target: number) => {
    const search = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) if (value) search.set(key, value);
    if (target > 1) search.set("page", String(target));
    else search.delete("page");
    const query = search.toString();
    return query ? `${basePath}?${query}` : basePath;
  };
  const linkClass = "inline-flex h-9 items-center gap-1 rounded-md border border-border bg-surface px-3 text-sm hover:border-border-strong";
  return (
    <nav aria-label="Lehekülgede valik" className="mt-4 flex flex-wrap items-center justify-between gap-3 text-sm">
      <p className="text-muted">
        Kokku {total} · lehekülg {page}/{pageCount}
      </p>
      <div className="flex gap-2">
        {page > 1 ? (
          <Link href={href(page - 1)} className={linkClass} rel="prev">
            <ChevronLeft className="size-4" aria-hidden /> Eelmine
          </Link>
        ) : (
          <span className={cx(linkClass, "pointer-events-none opacity-40")} aria-disabled="true">
            <ChevronLeft className="size-4" aria-hidden /> Eelmine
          </span>
        )}
        {page < pageCount ? (
          <Link href={href(page + 1)} className={linkClass} rel="next">
            Järgmine <ChevronRight className="size-4" aria-hidden />
          </Link>
        ) : (
          <span className={cx(linkClass, "pointer-events-none opacity-40")} aria-disabled="true">
            Järgmine <ChevronRight className="size-4" aria-hidden />
          </span>
        )}
      </div>
    </nav>
  );
}

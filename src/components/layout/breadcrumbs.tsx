import { ChevronRight } from "lucide-react";
import Link from "next/link";
import { JsonLd } from "@/components/seo/json-ld";

export interface Crumb {
  label: string;
  href?: string;
}

/** Leivapuru + BreadcrumbList structured data. */
export function Breadcrumbs({ items, siteUrl }: { items: Crumb[]; siteUrl: string }) {
  const all: Crumb[] = [{ label: "Avaleht", href: "/" }, ...items];
  return (
    <>
      <nav aria-label="Leivapuru" className="py-4 text-sm text-muted">
        <ol className="flex flex-wrap items-center gap-1">
          {all.map((crumb, index) => (
            <li key={crumb.label} className="flex items-center gap-1">
              {index > 0 && <ChevronRight className="size-3.5" aria-hidden />}
              {crumb.href && index < all.length - 1 ? (
                <Link href={crumb.href} className="hover:text-text hover:underline">
                  {crumb.label}
                </Link>
              ) : (
                <span aria-current={index === all.length - 1 ? "page" : undefined} className="text-text">
                  {crumb.label}
                </span>
              )}
            </li>
          ))}
        </ol>
      </nav>
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "BreadcrumbList",
          itemListElement: all.map((crumb, index) => ({
            "@type": "ListItem",
            position: index + 1,
            name: crumb.label,
            ...(crumb.href ? { item: new URL(crumb.href, siteUrl).toString() } : {}),
          })),
        }}
      />
    </>
  );
}

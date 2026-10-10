import { buildSpecSections } from "@/domain/catalog/spec-sections";
import type { CatalogItem } from "@/domain/catalog/types";

/** Tehnilised andmed rühmadena (mitte üks pikk tabel). Puuduvad väärtused on juba välja jäetud. */
export function SpecSections({ item }: { item: CatalogItem }) {
  const sections = buildSpecSections(item);
  return (
    <div className="grid gap-x-10 gap-y-8 md:grid-cols-2">
      {sections.map((section) => (
        <section key={section.title} aria-labelledby={`spec-${section.title}`}>
          <h3 id={`spec-${section.title}`} className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">
            {section.title}
          </h3>
          <dl className="divide-y divide-border border-y border-border">
            {section.rows.map((row) => (
              <div key={row.label} className="grid grid-cols-[minmax(0,2fr)_minmax(0,3fr)] gap-4 py-2.5 text-sm">
                <dt className="text-muted">{row.label}</dt>
                <dd className="font-medium">{row.value}</dd>
              </div>
            ))}
          </dl>
        </section>
      ))}
    </div>
  );
}

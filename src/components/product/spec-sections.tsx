import { BENCHMARK_INFO } from "@/domain/catalog/benchmarks";
import { buildSpecSections } from "@/domain/catalog/spec-sections";
import type { CatalogItem } from "@/domain/catalog/types";
import { cx } from "@/components/ui/class-names";
import { InfoTip } from "@/components/ui/info-tip";

/**
 * Tehnilised andmed rühmadena (mitte üks pikk tabel).
 * Puuduvad väärtused on juba välja jäetud (buildSpecSections); tühja rühma ei kuvata.
 * Olulisemad read (protsessor, mälu, salvestus, graafika, ekraan) on tugevama väärtusega; nimetus jääb vaiksemaks.
 * CSS veerud (mitte grid): eri pikkusega rühmad täidavad veerud järjest; mobiilis üks veerg.
 */
export function SpecSections({ item }: { item: CatalogItem }) {
  const sections = buildSpecSections(item);
  return (
    <div className="gap-x-10 md:columns-2">
      {sections.map((section) => (
        <section key={section.title} aria-labelledby={`spec-${section.title}`} className="mb-8 break-inside-avoid">
          <h3 id={`spec-${section.title}`} className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">
            {section.title}
          </h3>
          <dl className="divide-y divide-border border-y border-border">
            {section.rows.map((row, index) => (
              <div key={`${row.label}-${index}`} className="grid grid-cols-[minmax(0,2fr)_minmax(0,3fr)] items-baseline gap-4 py-2.5 text-sm">
                <dt className="flex items-center gap-1 text-muted">
                  {row.label}
                  {row.info && (
                    <InfoTip label={row.info === "cpu-benchmark" ? "Protsessori kiirusindeksi selgitus" : "Graafika kiirusindeksi selgitus"}>
                      {row.info === "cpu-benchmark" ? BENCHMARK_INFO.cpu : BENCHMARK_INFO.gpu}
                      <span className="mt-1 block text-muted">{BENCHMARK_INFO.note}</span>
                    </InfoTip>
                  )}
                </dt>
                <dd className={cx("min-w-0 [overflow-wrap:anywhere]", row.emphasis ? "text-[15px] font-semibold text-text sm:text-base" : "font-medium", row.info && "tabular-nums")}>
                  {row.value}
                </dd>
              </div>
            ))}
          </dl>
        </section>
      ))}
    </div>
  );
}

"use client";

import { ChevronDown } from "lucide-react";
import { useState, type ReactNode } from "react";
import { ADVANCED_FACETS, FACETS, PRIMARY_FACETS, type MultiFacetKey } from "@/domain/catalog/facets";
import type { CatalogFacets, FacetOption } from "@/domain/catalog/filtering";
import { toggleFacetValue, toggleFeature, withPriceRange, type CatalogQuery } from "@/domain/catalog/query";
import type { FeatureKey } from "@/domain/catalog/types";
import { cx } from "@/components/ui/class-names";
import { useCatalogNavigation } from "./catalog-navigation";

/**
 * Filtripaneel (desktopil külgriba, mobiilis drawer'i sees).
 * - valiku juures on tulemuste arv;
 * - tühje valikuid ja kasutuid filtreid ei näidata;
 * - iga muudatus rakendub kohe (URL muutub).
 */

function FilterGroup({ title, defaultOpen = true, children }: { title: string; defaultOpen?: boolean; children: ReactNode }) {
  return (
    <details open={defaultOpen} className="group border-b border-border py-4 last:border-b-0">
      <summary className="flex cursor-pointer list-none items-center justify-between text-sm font-semibold [&::-webkit-details-marker]:hidden">
        {title}
        <ChevronDown className="size-4 text-muted transition-transform group-open:rotate-180" aria-hidden />
      </summary>
      <div className="mt-3">{children}</div>
    </details>
  );
}

function OptionList({ name, options, onToggle }: { name: string; options: FacetOption[]; onToggle: (value: string) => void }) {
  const [expanded, setExpanded] = useState(false);
  const LIMIT = 6;
  const visible = expanded ? options : options.slice(0, LIMIT);

  return (
    <fieldset>
      <legend className="sr-only">{name}</legend>
      <ul className="space-y-1">
        {visible.map((option) => (
          <li key={option.value}>
            <label
              className={cx(
                "flex cursor-pointer items-center gap-3 rounded-md px-1 py-1.5 text-sm hover:bg-surface-alt",
                option.count === 0 && !option.selected && "cursor-default opacity-40",
              )}
            >
              <input
                type="checkbox"
                checked={option.selected}
                disabled={option.count === 0 && !option.selected}
                onChange={() => onToggle(option.value)}
                className="size-4 shrink-0 rounded border-border-strong accent-[var(--c-primary)]"
              />
              <span className="flex-1">{option.label}</span>
              <span className="tabular text-xs text-muted">{option.count}</span>
            </label>
          </li>
        ))}
      </ul>
      {options.length > LIMIT && (
        <button type="button" onClick={() => setExpanded(!expanded)} className="mt-1 px-1 text-sm font-medium text-primary hover:underline">
          {expanded ? "Näita vähem" : `Näita kõiki (${options.length})`}
        </button>
      )}
    </fieldset>
  );
}

function PriceFilter({ query, range }: { query: CatalogQuery; range: CatalogFacets["price"] }) {
  const { navigate } = useCatalogNavigation();
  const key = `${query.minPrice}-${query.maxPrice}`;

  return (
    <form
      key={key}
      className="flex items-end gap-2"
      onSubmit={(event) => {
        event.preventDefault();
        const data = new FormData(event.currentTarget);
        const parse = (value: FormDataEntryValue | null) => {
          const n = Number(value);
          return value && Number.isFinite(n) && n >= 0 ? Math.round(n) : null;
        };
        navigate(withPriceRange(query, parse(data.get("min")), parse(data.get("max"))));
      }}
    >
      <label className="flex-1 text-xs text-muted">
        Alates €
        <input
          name="min"
          type="number"
          inputMode="numeric"
          min={0}
          defaultValue={query.minPrice ?? ""}
          placeholder={range ? String(range.min) : ""}
          className="mt-1 h-10 w-full rounded-md border border-border-strong px-2 text-sm text-text"
        />
      </label>
      <label className="flex-1 text-xs text-muted">
        Kuni €
        <input
          name="max"
          type="number"
          inputMode="numeric"
          min={0}
          defaultValue={query.maxPrice ?? ""}
          placeholder={range ? String(range.max) : ""}
          className="mt-1 h-10 w-full rounded-md border border-border-strong px-2 text-sm text-text"
        />
      </label>
      <button type="submit" className="h-10 rounded-md bg-surface-sunken px-3 text-sm font-semibold hover:bg-border">
        OK
      </button>
    </form>
  );
}

export function FilterPanel({ query, facets, locked }: { query: CatalogQuery; facets: CatalogFacets; locked: Partial<Record<MultiFacetKey, string[]>> }) {
  const { navigate } = useCatalogNavigation();

  // Filter on kasulik ainult siis, kui sellel on vähemalt 2 valikut (või midagi on valitud)
  const usable = (key: MultiFacetKey) =>
    !locked[key] && (facets.multi[key].filter((o) => o.count > 0).length > 1 || facets.multi[key].some((o) => o.selected));

  const advancedFacets = ADVANCED_FACETS.filter(usable);
  const advancedActive = query.features.length > 0 || advancedFacets.some((key) => query.facets[key].length > 0);

  return (
    <div>
      <FilterGroup title="Hind">
        <PriceFilter query={query} range={facets.price} />
      </FilterGroup>

      {PRIMARY_FACETS.filter(usable).map((key) => (
        <FilterGroup key={key} title={FACETS[key].label}>
          <OptionList
            name={FACETS[key].label}
            options={facets.multi[key]}
            onToggle={(value) => navigate(toggleFacetValue(query, key, value))}
          />
        </FilterGroup>
      ))}

      {(facets.features.length > 0 || advancedFacets.length > 0) && (
        <FilterGroup title="Täpsemad filtrid" defaultOpen={advancedActive}>
          <div className="space-y-5">
            {facets.features.length > 0 && (
              <OptionList
                name="Omadused"
                options={facets.features}
                onToggle={(value) => navigate(toggleFeature(query, value as FeatureKey))}
              />
            )}
            {advancedFacets.map((key) => (
              <div key={key}>
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">{FACETS[key].label}</p>
                <OptionList
                  name={FACETS[key].label}
                  options={facets.multi[key]}
                  onToggle={(value) => navigate(toggleFacetValue(query, key, value))}
                />
              </div>
            ))}
          </div>
        </FilterGroup>
      )}
    </div>
  );
}

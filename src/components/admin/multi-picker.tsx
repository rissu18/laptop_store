"use client";

import { Search, X } from "lucide-react";
import { useId, useMemo, useState } from "react";

export interface PickerOption {
  id: string;
  label: string;
  hint?: string | null;
}

/**
 * Otsinguga mitmikvalik (mudelid / konfiguratsioonid). Valitud väärtused lähevad vormi peidetud väljadena,
 * seega töötab tavalise FormData-ga. Näitab korraga kuni 40 tulemust (otsing kitsendab).
 */
export function MultiPicker({ name, options, defaultSelected, placeholder, emptyLabel }: { name: string; options: PickerOption[]; defaultSelected: string[]; placeholder: string; emptyLabel: string }) {
  const [selected, setSelected] = useState<string[]>(defaultSelected);
  const [query, setQuery] = useState("");
  const listId = useId();
  const byId = useMemo(() => new Map(options.map((o) => [o.id, o])), [options]);

  const results = useMemo(() => {
    const tokens = query.toLowerCase().split(/\s+/).filter(Boolean);
    return options.filter((o) => !selected.includes(o.id) && tokens.every((t) => `${o.label} ${o.hint ?? ""}`.toLowerCase().includes(t))).slice(0, 40);
  }, [options, query, selected]);

  return (
    <div className="flex flex-col gap-2">
      {selected.map((id) => (
        <input key={id} type="hidden" name={name} value={id} />
      ))}
      {selected.length > 0 ? (
        <ul className="flex flex-wrap gap-1.5" aria-label="Valitud">
          {selected.map((id) => (
            <li key={id} className="inline-flex max-w-full items-center gap-1 rounded-full bg-primary-soft py-1 pr-1 pl-3 text-sm text-primary">
              <span className="truncate">{byId.get(id)?.label ?? id}</span>
              <button type="button" onClick={() => setSelected((list) => list.filter((x) => x !== id))} className="rounded-full p-1 hover:bg-primary/10" aria-label={`Eemalda ${byId.get(id)?.label ?? id}`}>
                <X className="size-3.5" aria-hidden />
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted">{emptyLabel}</p>
      )}
      <label className="relative">
        <span className="sr-only">{placeholder}</span>
        <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-subtle" aria-hidden />
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={placeholder}
          aria-controls={listId}
          className="h-10 w-full rounded-md border border-border-strong bg-surface pr-2 pl-8 text-sm"
        />
      </label>
      <ul id={listId} className="max-h-56 overflow-y-auto rounded-md border border-border">
        {results.length === 0 && <li className="px-3 py-2 text-sm text-muted">Tulemusi pole</li>}
        {results.map((option) => (
          <li key={option.id}>
            <button
              type="button"
              onClick={() => {
                setSelected((list) => [...list, option.id]);
                setQuery("");
              }}
              className="flex w-full flex-col items-start px-3 py-2 text-left text-sm hover:bg-surface-alt"
            >
              <span>{option.label}</span>
              {option.hint && <span className="text-xs text-muted">{option.hint}</span>}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

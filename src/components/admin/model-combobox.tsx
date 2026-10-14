"use client";

import { X } from "lucide-react";
import { useId, useMemo, useRef, useState } from "react";

export interface ModelOption {
  id: string;
  label: string;
}

const normalize = (value: string) => value.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, " ").trim();

/** Kõik sõnad peavad leiduma (järjekorrast sõltumata): "t14 lenovo gen 3" leiab "Lenovo ThinkPad T14 Gen 3". */
export function filterModelOptions(options: ModelOption[], query: string, limit = 30): ModelOption[] {
  const words = normalize(query).split(" ").filter(Boolean);
  if (!words.length) return options.slice(0, limit);
  return options.filter((option) => words.every((word) => normalize(option.label).includes(word))).slice(0, limit);
}

/**
 * Mudeli filter otsinguga (asendab 558-realise rippmenüü). Väärtus läheb GET-vormi peidetud väljana `name`
 * (mudeli ID); valik saadab vormi kohe, nagu teised filtrid.
 */
export function ModelCombobox({ name, label, value, options }: { name: string; label: string; value?: string; options: ModelOption[] }) {
  const listId = useId();
  const hiddenRef = useRef<HTMLInputElement>(null);
  const selected = options.find((option) => option.id === value) ?? null;
  const [query, setQuery] = useState(selected?.label ?? "");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const matches = useMemo(() => filterModelOptions(options, query), [options, query]);

  const choose = (option: ModelOption | null) => {
    if (!hiddenRef.current) return;
    hiddenRef.current.value = option?.id ?? "";
    setQuery(option?.label ?? "");
    setOpen(false);
    hiddenRef.current.form?.requestSubmit();
  };

  return (
    <div className="relative flex min-w-64 flex-col gap-1 text-xs text-muted">
      <label htmlFor={`${listId}-input`}>{label}</label>
      <input ref={hiddenRef} type="hidden" name={name} defaultValue={value ?? ""} />
      <div className="relative">
        <input
          id={`${listId}-input`}
          type="text"
          role="combobox"
          aria-expanded={open}
          aria-controls={`${listId}-list`}
          aria-autocomplete="list"
          aria-activedescendant={open && matches[active] ? `${listId}-${matches[active].id}` : undefined}
          autoComplete="off"
          value={query}
          placeholder="Kõik — kirjuta mudeli nimi"
          onChange={(event) => {
            setQuery(event.target.value);
            setActive(0);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          onKeyDown={(event) => {
            if (event.key === "ArrowDown") {
              event.preventDefault();
              setOpen(true);
              setActive((i) => Math.min(i + 1, matches.length - 1));
            } else if (event.key === "ArrowUp") {
              event.preventDefault();
              setActive((i) => Math.max(i - 1, 0));
            } else if (event.key === "Enter" && open && matches[active]) {
              event.preventDefault();
              choose(matches[active]);
            } else if (event.key === "Escape") {
              setOpen(false);
            }
          }}
          className="h-9 w-full rounded-md border border-border-strong bg-surface pr-8 pl-2 text-sm text-text"
        />
        {(query || value) && (
          <button type="button" aria-label="Eemalda mudeli filter" onClick={() => choose(null)} className="absolute top-1/2 right-1.5 -translate-y-1/2 rounded p-1 text-subtle hover:text-text">
            <X className="size-4" aria-hidden />
          </button>
        )}
      </div>
      {open && (
        <ul id={`${listId}-list`} role="listbox" className="absolute top-full z-20 mt-1 max-h-72 w-full min-w-72 overflow-auto rounded-md border border-border bg-surface py-1 text-sm text-text shadow-lg">
          {matches.length === 0 ? (
            <li className="px-3 py-2 text-muted">Mudelit ei leitud</li>
          ) : (
            matches.map((option, index) => (
              <li
                key={option.id}
                id={`${listId}-${option.id}`}
                role="option"
                aria-selected={index === active}
                onMouseDown={(event) => {
                  event.preventDefault();
                  choose(option);
                }}
                onMouseEnter={() => setActive(index)}
                className={index === active ? "cursor-pointer bg-surface-alt px-3 py-1.5" : "cursor-pointer px-3 py-1.5"}
              >
                {option.label}
              </li>
            ))
          )}
        </ul>
      )}
    </div>
  );
}

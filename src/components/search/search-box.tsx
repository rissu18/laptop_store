"use client";

import { Loader2, Search } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";
import { formatEur } from "@/domain/money/money";
import { cx } from "@/components/ui/class-names";

/**
 * Otsingukast koos autocomplete'iga (ARIA combobox muster).
 * Klaviatuur: ↑/↓ liigub, Enter avab, Esc sulgeb.
 * Andmed tulevad meie serverist (/api/search), mitte tarnijalt.
 */

export interface SearchSuggestion {
  href: string;
  title: string;
  specs: string;
  priceCents: number;
}

const DEBOUNCE_MS = 150;

export function SearchBox({ size = "md", autoFocus, className }: { size?: "md" | "lg"; autoFocus?: boolean; className?: string }) {
  const router = useRouter();
  const listId = useId();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchSuggestion[]>([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const [loading, setLoading] = useState(false);
  const containerRef = useRef<HTMLFormElement>(null);

  const trimmed = query.trim();

  useEffect(() => {
    if (trimmed.length < 2) return;
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setLoading(true);
      try {
        const response = await fetch(`/api/search?q=${encodeURIComponent(trimmed)}`, { signal: controller.signal });
        if (response.ok) {
          const data = (await response.json()) as { results: SearchSuggestion[] };
          setResults(data.results);
          setActive(-1);
        }
      } catch {
        // katkestatud päring (kasutaja trükkis edasi) — pole viga
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }, DEBOUNCE_MS);
    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [trimmed]);

  // Sulge, kui klikitakse mujale
  useEffect(() => {
    const onPointerDown = (event: PointerEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, []);

  const visibleResults = trimmed.length >= 2 ? results : [];
  const showList = open && trimmed.length >= 2;
  const allHref = `/sulearvutid?q=${encodeURIComponent(trimmed)}`;

  function go(href: string) {
    setOpen(false);
    router.push(href);
  }

  return (
    <form
      ref={containerRef}
      role="search"
      action="/sulearvutid"
      className={cx("relative w-full", className)}
      onSubmit={(event) => {
        event.preventDefault();
        if (active >= 0 && visibleResults[active]) go(visibleResults[active].href);
        else if (trimmed) go(allHref);
      }}
    >
      <label htmlFor={`${listId}-input`} className="sr-only">
        Otsi sülearvutit
      </label>
      <div className="relative">
        <Search
          className={cx("pointer-events-none absolute top-1/2 -translate-y-1/2 text-muted", size === "lg" ? "left-4 size-5" : "left-3 size-4")}
          aria-hidden
        />
        <input
          id={`${listId}-input`}
          name="q"
          type="search"
          autoComplete="off"
          autoFocus={autoFocus}
          placeholder="Otsi näiteks ThinkPad T14, EliteBook 840…"
          value={query}
          role="combobox"
          aria-expanded={showList}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={active >= 0 ? `${listId}-${active}` : undefined}
          onChange={(event) => {
            setQuery(event.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={(event) => {
            if (event.key === "ArrowDown") {
              event.preventDefault();
              setOpen(true);
              setActive((i) => Math.min(i + 1, visibleResults.length - 1));
            } else if (event.key === "ArrowUp") {
              event.preventDefault();
              setActive((i) => Math.max(i - 1, -1));
            } else if (event.key === "Escape") {
              setOpen(false);
            }
          }}
          className={cx(
            "w-full rounded-md border border-border-strong bg-surface text-text placeholder:text-subtle",
            "focus:border-primary focus:outline-none focus:ring-[3px] focus:ring-primary/20",
            "[&::-webkit-search-cancel-button]:hidden",
            size === "lg" ? "h-14 pl-12 pr-28 text-base shadow-sm" : "h-11 pl-10 pr-4 text-sm",
          )}
        />
        {loading && <Loader2 className="absolute right-3 top-1/2 size-4 -translate-y-1/2 animate-spin text-muted" aria-hidden />}
        {size === "lg" && (
          <button
            type="submit"
            className="absolute right-2 top-1/2 h-10 -translate-y-1/2 rounded-md bg-primary px-4 text-sm font-semibold text-on-primary hover:bg-primary-hover"
          >
            Otsi
          </button>
        )}
      </div>

      {showList && (
        <div className="absolute inset-x-0 top-full z-50 mt-2 overflow-hidden rounded-lg border border-border bg-surface shadow-lg">
          <ul id={listId} role="listbox" aria-label="Otsingu soovitused">
            {visibleResults.map((result, index) => (
              <li
                key={result.href}
                id={`${listId}-${index}`}
                role="option"
                aria-selected={index === active}
                onPointerDown={(event) => {
                  event.preventDefault();
                  go(result.href);
                }}
                onPointerEnter={() => setActive(index)}
                className={cx(
                  "flex cursor-pointer items-center justify-between gap-4 px-4 py-3",
                  index === active && "bg-surface-alt",
                )}
              >
                <span className="min-w-0">
                  <span className="block truncate text-sm font-semibold">{result.title}</span>
                  <span className="block truncate text-xs text-muted">{result.specs}</span>
                </span>
                <span className="tabular shrink-0 text-sm font-bold">{formatEur(result.priceCents)}</span>
              </li>
            ))}
          </ul>
          {!loading && visibleResults.length === 0 ? (
            <p className="px-4 py-3 text-sm text-muted">Sobivaid sülearvuteid ei leitud.</p>
          ) : (
            <button
              type="submit"
              className="block w-full border-t border-border px-4 py-3 text-left text-sm font-semibold text-primary hover:bg-surface-alt"
            >
              Näita kõiki tulemusi: „{trimmed}“
            </button>
          )}
        </div>
      )}
    </form>
  );
}

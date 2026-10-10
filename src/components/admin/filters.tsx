"use client";

import { Search, X } from "lucide-react";
import Form from "next/form";
import Link from "next/link";
import type { ReactNode } from "react";

/**
 * Filtririba: tavaline GET-vorm (URL on jagatav ja töötab ka ilma JS-ita).
 * next/form teeb navigeerimise kliendipoolselt; valiku muutmine saadab vormi kohe.
 */
export function FilterForm({ action, children, resetHref }: { action: string; children: ReactNode; resetHref?: string }) {
  return (
    <Form
      action={action}
      className="mb-4 flex flex-wrap items-end gap-2"
      onChange={(event) => {
        if (event.target instanceof HTMLSelectElement) event.currentTarget.requestSubmit();
      }}
    >
      {children}
      <button type="submit" className="h-9 rounded-md bg-primary px-3 text-sm font-semibold text-on-primary hover:bg-primary-hover">
        Filtreeri
      </button>
      {resetHref && (
        <Link href={resetHref} className="inline-flex h-9 items-center gap-1 rounded-md px-2 text-sm text-muted hover:text-text">
          <X className="size-4" aria-hidden /> Tühjenda
        </Link>
      )}
    </Form>
  );
}

export function SearchField({ name = "q", defaultValue, placeholder = "Otsi…" }: { name?: string; defaultValue?: string; placeholder?: string }) {
  return (
    <label className="relative flex min-w-56 flex-1 sm:max-w-sm">
      <span className="sr-only">{placeholder}</span>
      <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-subtle" aria-hidden />
      <input
        type="search"
        name={name}
        defaultValue={defaultValue}
        placeholder={placeholder}
        maxLength={100}
        className="h-9 w-full rounded-md border border-border-strong bg-surface pr-2 pl-8 text-sm"
      />
    </label>
  );
}

export function SelectFilter({ name, label, value, options }: { name: string; label: string; value?: string; options: { value: string; label: string }[] }) {
  return (
    <label className="flex flex-col gap-1 text-xs text-muted">
      {label}
      <select name={name} defaultValue={value ?? ""} className="h-9 rounded-md border border-border-strong bg-surface px-2 text-sm text-text">
        <option value="">Kõik</option>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}

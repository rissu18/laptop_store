"use client";

import { Check, Tag, X } from "lucide-react";
import { useId, useState } from "react";
import { formatEur } from "@/domain/money/money";
import type { PublicDiscountResult } from "@/server/discounts/discount-service";

/**
 * Sooduskoodi sisestus ostukorvis. Brauser saadab serverile ainult koodi teksti;
 * kehtivuse ja summa otsustab server. Korraga saab kasutada ühte koodi.
 */
export function DiscountCodeForm({
  applied,
  pending,
  error,
  onApply,
  onRemove,
}: {
  /** Serveri kinnitatud kehtiv kood (või null) */
  applied: PublicDiscountResult | null;
  pending: boolean;
  error: string | null;
  onApply: (code: string) => void;
  onRemove: () => void;
}) {
  const [value, setValue] = useState("");
  const inputId = useId();
  const errorId = useId();

  if (applied?.valid) {
    return (
      <div className="rounded-md border border-success/40 bg-success-soft p-3">
        <div className="flex items-center justify-between gap-3">
          <p className="flex min-w-0 items-center gap-2 text-sm font-semibold">
            <Tag className="size-4 shrink-0 text-success" aria-hidden />
            <span className="truncate">{applied.code}</span>
            <Check className="size-4 shrink-0 text-success" aria-label="kehtiv" />
          </p>
          <span className="tabular shrink-0 text-sm font-semibold text-success">
            {applied.freeShipping ? "Tasuta tarne" : `−${formatEur(applied.discountAmountCents)}`}
          </span>
        </div>
        {applied.freeShipping && <p className="mt-1 text-xs text-muted">{applied.message}</p>}
        <button type="button" onClick={onRemove} disabled={pending} className="mt-2 inline-flex min-h-9 items-center gap-1 text-sm text-muted hover:text-danger disabled:opacity-50">
          <X className="size-4" aria-hidden /> Eemalda
        </button>
        <p className="mt-1 text-xs text-muted">Ostukorvis saab korraga kasutada ühte sooduskoodi.</p>
      </div>
    );
  }

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        if (value.trim()) onApply(value.trim());
      }}
      noValidate
    >
      <label htmlFor={inputId} className="text-sm font-medium">
        Sooduskood
      </label>
      <div className="mt-1 flex gap-2">
        <input
          id={inputId}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          maxLength={40}
          autoComplete="off"
          autoCapitalize="characters"
          spellCheck={false}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? errorId : undefined}
          className="h-11 min-w-0 flex-1 rounded-md border border-border-strong bg-surface px-3 text-base uppercase placeholder:normal-case sm:text-sm"
          placeholder="Sisesta kood"
        />
        <button
          type="submit"
          disabled={pending || !value.trim()}
          className="h-11 shrink-0 rounded-md bg-text px-4 text-sm font-semibold text-white hover:bg-text/90 disabled:opacity-50"
        >
          {pending ? "…" : "Rakenda"}
        </button>
      </div>
      {error && (
        <p id={errorId} role="alert" className="mt-2 text-sm break-words text-danger">
          {error}
        </p>
      )}
    </form>
  );
}

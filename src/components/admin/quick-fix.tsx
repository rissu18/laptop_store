"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import type { QuickFixField } from "@/domain/admin/quick-fix";
import { clearOverrideAction, setListingOverrideAction } from "@/server/admin/products/actions";
import { useToast } from "./toast";

/**
 * Andmekvaliteedi kiirparandus: klaviatuur registrist (salvestub parandusena, tarnija toorandmed jäävad alles).
 * Pärast salvestamist leht värskendub — rida kaob "Tundmatu klaviatuur" nimekirjast ja loendur väheneb.
 */
export function KeyboardQuickFix({ listingId, options }: { listingId: string; options: { code: string; label: string }[] }) {
  const toast = useToast();
  const [code, setCode] = useState("");
  const [pending, startTransition] = useTransition();
  return (
    <form
      className="flex flex-col items-start gap-1"
      onSubmit={(event) => {
        event.preventDefault();
        if (!code) return;
        startTransition(async () => {
          const result = await setListingOverrideAction(listingId, "keyboard", code);
          if (result.ok) toast.success(result.message);
          else toast.error(result.error);
        });
      }}
    >
      <select aria-label="Klaviatuur" value={code} onChange={(e) => setCode(e.target.value)} disabled={pending} className="h-8 w-32 rounded-md border border-border-strong bg-surface px-1.5 text-xs">
        <option value="">Vali paigutus…</option>
        {options.map((o) => (
          <option key={o.code} value={o.code}>
            {o.label}
          </option>
        ))}
      </select>
      <Button type="submit" size="sm" disabled={pending || !code}>
        {pending ? "…" : "Salvesta"}
      </Button>
    </form>
  );
}

/** Jõudlusväärtuse parandus (konfiguratsiooni leht): number + Salvesta; olemasoleva paranduse korral "Taasta". */
export function PerformanceOverrideField({ listingId, field, hasManual, placeholder }: { listingId: string; field: Exclude<QuickFixField, "keyboard">; hasManual: boolean; placeholder: string }) {
  const toast = useToast();
  const [value, setValue] = useState("");
  const [pending, startTransition] = useTransition();
  const run = (task: () => ReturnType<typeof setListingOverrideAction>) =>
    startTransition(async () => {
      const result = await task();
      if (result.ok) {
        toast.success(result.message);
        setValue("");
      } else toast.error(result.error);
    });
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <input
        aria-label="Admini parandus"
        inputMode="numeric"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder={placeholder}
        disabled={pending}
        className="h-8 w-28 rounded-md border border-border-strong bg-surface px-2 text-xs"
      />
      <Button type="button" size="sm" variant="outline" disabled={pending || !value.trim()} onClick={() => run(() => setListingOverrideAction(listingId, field, value))}>
        Salvesta
      </Button>
      {hasManual && (
        <Button type="button" size="sm" variant="ghost" disabled={pending} onClick={() => run(() => clearOverrideAction("listing", listingId, field))}>
          Taasta
        </Button>
      )}
    </div>
  );
}

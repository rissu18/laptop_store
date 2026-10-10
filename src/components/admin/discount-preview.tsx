"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { cx } from "@/components/ui/class-names";
import { formatEur } from "@/domain/money/money";
import { previewDiscountAction, type DiscountPreviewResult } from "@/server/admin/discounts/actions";
import { inputClass } from "./entity-form";
import type { PickerOption } from "./multi-picker";
import { Badge, Card } from "./ui";

/**
 * Admini eelvaade: kasutab SAMA DiscountEngine'i mis ostukorv. Näitab soodustust, lõppsummat,
 * millistele ridadele kood rakendub ja kas marginaalikaitse vähendas soodustust.
 */
export function DiscountPreview({ id, listings }: { id: string; listings: PickerOption[] }) {
  const [mode, setMode] = useState<"subtotal" | "listings">("listings");
  const [subtotal, setSubtotal] = useState("800");
  const [selected, setSelected] = useState<string[]>([]);
  const [query, setQuery] = useState("");
  const [result, setResult] = useState<DiscountPreviewResult | null>(null);
  const [pending, startTransition] = useTransition();

  const matches = query.trim()
    ? listings.filter((l) => !selected.includes(l.id) && `${l.label} ${l.hint ?? ""}`.toLowerCase().includes(query.toLowerCase())).slice(0, 8)
    : [];

  const run = () =>
    startTransition(async () => {
      setResult(
        await previewDiscountAction(id, mode === "subtotal" ? { subtotalEuros: subtotal, listings: [] } : { listings: selected.map((listingId) => ({ id: listingId, quantity: 1 })) }),
      );
    });

  return (
    <Card title="Testi koodi" description="Arvutus nagu ostukorvis. Mustandit saab testida — arvutatakse nii, nagu kood oleks aktiivne.">
      <div className="mb-3 flex gap-2 text-sm">
        {(["listings", "subtotal"] as const).map((m) => (
          <button key={m} type="button" onClick={() => setMode(m)} className={cx("min-h-9 rounded-md border px-3", mode === m ? "border-primary bg-primary-soft font-semibold text-primary" : "border-border")}>
            {m === "listings" ? "Konfiguratsioonid" : "Test-summa"}
          </button>
        ))}
      </div>

      {mode === "subtotal" ? (
        <label className="flex flex-col gap-1 text-sm font-medium">
          Ostukorvi summa (€)
          <input value={subtotal} onChange={(e) => setSubtotal(e.target.value)} inputMode="decimal" className={inputClass} />
          <span className="text-xs font-normal text-muted">Test-summa ei kuulu ühelegi tootjale/mudelile → sobib ainult „kõik tooted“ koodi testimiseks.</span>
        </label>
      ) : (
        <div className="flex flex-col gap-2 text-sm">
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Otsi konfiguratsiooni (SKU, mudel, CPU)…" className={inputClass} aria-label="Otsi konfiguratsiooni" />
          {matches.length > 0 && (
            <ul className="rounded-md border border-border">
              {matches.map((m) => (
                <li key={m.id}>
                  <button
                    type="button"
                    className="w-full px-3 py-2 text-left hover:bg-surface-alt"
                    onClick={() => {
                      setSelected((list) => [...list, m.id].slice(0, 20));
                      setQuery("");
                    }}
                  >
                    {m.label}
                    {m.hint && <span className="block text-xs text-muted">{m.hint}</span>}
                  </button>
                </li>
              ))}
            </ul>
          )}
          {selected.length > 0 && (
            <ul className="space-y-1">
              {selected.map((sid) => (
                <li key={sid} className="flex items-center justify-between gap-2 rounded-md bg-surface-alt px-2 py-1">
                  <span className="truncate">{listings.find((l) => l.id === sid)?.label}</span>
                  <button type="button" className="text-xs text-muted hover:text-danger" onClick={() => setSelected((list) => list.filter((x) => x !== sid))}>
                    Eemalda
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      <Button size="sm" className="mt-3" onClick={run} disabled={pending || (mode === "listings" && selected.length === 0)}>
        {pending ? "Arvutan…" : "Arvuta"}
      </Button>

      {result && !result.ok && <p className="mt-3 text-sm text-danger">{result.error}</p>}
      {result?.ok && (
        <div className="mt-4 space-y-3 text-sm">
          <p className={result.valid ? "text-success" : "text-danger"}>{result.message}</p>
          <p className="text-xs text-muted">Praegu poes: {result.liveMessage}</p>
          <dl className="grid grid-cols-2 gap-1">
            <dt className="text-muted">Vahesumma</dt>
            <dd className="text-right tabular-nums">{formatEur(result.subtotalCents)}</dd>
            <dt className="text-muted">Sobiv summa</dt>
            <dd className="text-right tabular-nums">{formatEur(result.eligibleSubtotalCents)}</dd>
            <dt className="text-muted">Soodustus</dt>
            <dd className="text-right font-semibold tabular-nums text-success">−{formatEur(result.discountCents)}</dd>
            <dt className="font-semibold">Lõppsumma</dt>
            <dd className="text-right font-semibold tabular-nums">{formatEur(result.totalCents)}</dd>
          </dl>
          {result.lines.length > 1 || mode === "listings" ? (
            <ul className="divide-y divide-border rounded-md border border-border">
              {result.lines.map((line, i) => (
                <li key={i} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2">
                  <span className="min-w-0 flex-1 truncate">{line.label}</span>
                  <span className="flex items-center gap-1.5">
                    {!line.eligible && <Badge>ei kehti</Badge>}
                    {line.marginLimited && <Badge tone="warning">marginaal</Badge>}
                    {line.marginUnchecked && line.eligible && <Badge tone="info">marginaal kontrollimata</Badge>}
                    <span className="tabular-nums">{line.discountCents ? `−${formatEur(line.discountCents)}` : "—"}</span>
                  </span>
                </li>
              ))}
            </ul>
          ) : null}
          {result.marginLimitedCount > 0 && (
            <p className="rounded-md bg-warning-soft p-2 text-warning">
              {result.marginLimitedCount} toote soodustust vähendati, sest allahindlus oleks viinud hinna alla minimaalse lubatud marginaali.
            </p>
          )}
          {result.marginUncheckedCount > 0 && <p className="text-xs text-muted">{result.marginUncheckedCount} real ei saanud marginaali kontrollida (puudub ostuhind või käibemaksurežiim).</p>}
        </div>
      )}
    </Card>
  );
}

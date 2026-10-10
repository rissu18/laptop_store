"use client";

import { Plus, Trash2 } from "lucide-react";
import { useActionState, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import type { ActionResult } from "@/server/admin/action-result";
import { applyPricingAction, savePricingRulesAction } from "@/server/admin/pricing/actions";
import { ConfirmDialog } from "./confirm-dialog";
import { inputClass } from "./entity-form";
import { useToast } from "./toast";

interface BandInput {
  key: number;
  from: string;
  to: string;
  fixed: string;
  pct: string;
}

const SETTINGS_FIELDS: { name: string; label: string; suffix: string; hint?: string }[] = [
  { name: "vatRateBps", label: "Käibemaks", suffix: "%" },
  { name: "supplierShippingCents", label: "Tarnija transport", suffix: "€", hint: "Kulu ühe seadme kohta" },
  { name: "warrantyReserveBps", label: "Garantiireserv", suffix: "%", hint: "% ostuhinnast" },
  { name: "paymentFeeBps", label: "Makseteenuse tasu", suffix: "%" },
  { name: "paymentFeeFixedCents", label: "Makseteenuse fikseeritud tasu", suffix: "€" },
  { name: "minProfitCents", label: "Min kasum", suffix: "€", hint: "Vähemalt see summa" },
  { name: "minProfitBps", label: "Min kasum", suffix: "%", hint: "% müügihinnast (kehtib suurem)" },
  { name: "minSalePriceCents", label: "Min müügihind", suffix: "€" },
];

let bandKey = 1000;

export function PricingRulesForm({ settings, bands }: { settings: Record<string, string>; bands: Omit<BandInput, "key">[] }) {
  const toast = useToast();
  const [rows, setRows] = useState<BandInput[]>(() => bands.map((band, index) => ({ ...band, key: index })));
  const [state, formAction, pending] = useActionState(async (prev: ActionResult | null, formData: FormData) => {
    const result = await savePricingRulesAction(prev, formData);
    if (result.ok) toast.success(result.message);
    else toast.error(result.error);
    return result;
  }, null);
  const errors = state && !state.ok ? (state.fieldErrors ?? {}) : {};

  const update = (key: number, field: keyof Omit<BandInput, "key">, value: string) => setRows((list) => list.map((row) => (row.key === key ? { ...row, [field]: value } : row)));

  return (
    <form action={formAction} className="flex flex-col gap-6" noValidate>
      <fieldset className="rounded-lg border border-border bg-surface p-4 sm:p-5">
        <legend className="px-1 font-semibold">Kulud ja kaitsepiirid</legend>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {SETTINGS_FIELDS.map((field) => (
            <label key={field.name} className="flex flex-col gap-1 text-sm font-medium">
              {field.label} ({field.suffix})
              <input name={field.name} defaultValue={settings[field.name]} inputMode="decimal" className={inputClass} aria-invalid={Boolean(errors[field.name]) || undefined} />
              <span className="min-h-4 text-xs font-normal">{errors[field.name] ? <span className="text-danger">{errors[field.name]}</span> : <span className="text-muted">{field.hint}</span>}</span>
            </label>
          ))}
          <label className="flex flex-col gap-1 text-sm font-medium">
            Ümardamine
            <select name="rounding" defaultValue={settings.rounding} className={inputClass}>
              <option value="ending-9">…9 € (nt 429 €, 1049 €)</option>
              <option value="whole-euro">Täiseurodeni</option>
              <option value="none">Ei ümarda</option>
            </select>
          </label>
        </div>
      </fieldset>

      <fieldset className="rounded-lg border border-border bg-surface p-4 sm:p-5">
        <legend className="px-1 font-semibold">Juurdehindlus ostuhinna järgi</legend>
        <p className="mb-3 text-sm text-muted">Vahemikud peavad algama 0 €-st ja olema järjestikused. Viimase vahemiku „kuni“ võib jätta tühjaks (piiranguta).</p>
        <div className="flex flex-col gap-3">
          {rows.map((row, index) => (
            <div key={row.key} className="grid grid-cols-2 items-end gap-2 rounded-md border border-border p-3 sm:grid-cols-[repeat(4,minmax(0,1fr))_auto] sm:border-0 sm:p-0">
              {(
                [
                  ["from", "band.from", "Alates (€)"],
                  ["to", "band.to", "Kuni (€)"],
                  ["fixed", "band.fixed", "Juurdehindlus (€)"],
                  ["pct", "band.pct", "Juurdehindlus (%)"],
                ] as const
              ).map(([field, name, label]) => (
                <label key={field} className="flex flex-col gap-1 text-xs text-muted">
                  <span className={index === 0 ? undefined : "sm:sr-only"}>{label}</span>
                  <input name={name} value={row[field]} onChange={(e) => update(row.key, field, e.target.value)} inputMode="decimal" className={inputClass} placeholder={field === "to" ? "∞" : undefined} />
                </label>
              ))}
              <button
                type="button"
                onClick={() => setRows((list) => list.filter((r) => r.key !== row.key))}
                disabled={rows.length === 1}
                className="col-span-2 inline-flex h-10 items-center justify-center gap-1 rounded-md px-2 text-sm text-muted hover:bg-surface-sunken hover:text-danger disabled:opacity-40 sm:col-span-1"
                aria-label={`Eemalda vahemik ${index + 1}`}
              >
                <Trash2 className="size-4" aria-hidden /> <span className="sm:sr-only">Eemalda</span>
              </button>
            </div>
          ))}
        </div>
        <Button
          variant="outline"
          size="sm"
          className="mt-3"
          onClick={() => setRows((list) => [...list, { key: bandKey++, from: list.at(-1)?.to ?? "", to: "", fixed: "0", pct: "0" }])}
        >
          <Plus className="size-4" aria-hidden /> Lisa vahemik
        </Button>
      </fieldset>

      <div className="flex items-center justify-end gap-3">
        {state && !state.ok && <p className="mr-auto text-sm text-danger">{state.error}</p>}
        <Button type="submit" disabled={pending}>
          {pending ? "Salvestan…" : "Salvesta reeglid"}
        </Button>
      </div>
    </form>
  );
}

export function ApplyPricingButton({ changedCount, skippedCount }: { changedCount: number; skippedCount: number }) {
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  return (
    <>
      <Button onClick={() => setOpen(true)} disabled={changedCount === 0}>
        Rakenda hinnad ({changedCount})
      </Button>
      <ConfirmDialog
        open={open}
        title="Rakenda uued hinnad?"
        confirmLabel={`Muuda ${changedCount} hinda`}
        pending={pending}
        onCancel={() => setOpen(false)}
        onConfirm={() =>
          startTransition(async () => {
            const result = await applyPricingAction();
            if (result.ok) toast.success(result.message);
            else toast.error(result.error);
            setOpen(false);
          })
        }
      >
        <p>
          {changedCount} pakkumise müügihind muutub eelvaates näidatud väärtusele. Muudatus jõuab poodi kohe ja iga hinnamuutus salvestatakse tegevuslogisse.
        </p>
        {skippedCount > 0 && <p className="text-warning">{skippedCount} pakkumist jäetakse vahele (puudub ostuhind või käibemaksu režiim).</p>}
      </ConfirmDialog>
    </>
  );
}

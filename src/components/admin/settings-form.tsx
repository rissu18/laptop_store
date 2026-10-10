"use client";

import { useActionState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import type { EditableSettingsKey } from "@/domain/admin/settings-form";
import type { Settings } from "@/domain/settings/settings";
import type { ActionResult } from "@/server/admin/action-result";
import { saveSettingsAction } from "@/server/admin/settings/actions";
import { inputClass } from "./entity-form";
import { toInput } from "./format";
import { useToast } from "./toast";

/** Üks seadete grupp = üks vorm ja üks salvestusnupp (vead näidatakse välja juures). */
function SettingsGroupForm({ group, title, description, children }: { group: EditableSettingsKey; title: string; description?: ReactNode; children: (errors: Record<string, string>) => ReactNode }) {
  const toast = useToast();
  const [state, formAction, pending] = useActionState(async (prev: ActionResult | null, formData: FormData) => {
    const result = await saveSettingsAction(group, prev, formData);
    if (result.ok) toast.success(result.message);
    else toast.error(result.error);
    return result;
  }, null);
  const errors = state && !state.ok ? (state.fieldErrors ?? {}) : {};

  return (
    <form action={formAction} className="rounded-lg border border-border bg-surface" noValidate>
      <div className="border-b border-border px-4 py-3 sm:px-5">
        <h2 className="font-semibold">{title}</h2>
        {description && <p className="mt-0.5 text-sm text-muted">{description}</p>}
      </div>
      <div className="grid gap-4 p-4 sm:grid-cols-2 sm:p-5">{children(errors)}</div>
      <div className="flex items-center justify-end gap-3 border-t border-border px-4 py-3 sm:px-5">
        {state && !state.ok && <p className="mr-auto text-sm text-danger">{state.error}</p>}
        <Button type="submit" size="sm" disabled={pending}>
          {pending ? "Salvestan…" : "Salvesta"}
        </Button>
      </div>
    </form>
  );
}

function TextField({ name, label, defaultValue, error, hint, wide, type = "text" }: { name: string; label: string; defaultValue: string | null; error?: string; hint?: string; wide?: boolean; type?: string }) {
  return (
    <label className={`flex flex-col gap-1 text-sm font-medium ${wide ? "sm:col-span-2" : ""}`}>
      {label}
      <input name={name} type={type} defaultValue={defaultValue ?? ""} className={inputClass} aria-invalid={Boolean(error) || undefined} maxLength={200} />
      <span className="min-h-4 text-xs font-normal">{error ? <span className="text-danger">{error}</span> : <span className="text-muted">{hint}</span>}</span>
    </label>
  );
}

function TextArea({ name, label, defaultValue, error, hint }: { name: string; label: string; defaultValue: string | null; error?: string; hint?: string }) {
  return (
    <label className="flex flex-col gap-1 text-sm font-medium sm:col-span-2">
      {label}
      <textarea name={name} defaultValue={defaultValue ?? ""} rows={4} maxLength={2000} className={`${inputClass} h-auto py-2`} aria-invalid={Boolean(error) || undefined} />
      <span className="min-h-4 text-xs font-normal">{error ? <span className="text-danger">{error}</span> : <span className="text-muted">{hint}</span>}</span>
    </label>
  );
}

/**
 * Poe seaded gruppide kaupa. NB! Need on POE üldinfo (nt garantii üldtekst) — need ei asenda ega
 * väljamõtle pakkumiste andmeid (pakkumise garantii/aku tulevad ainult tarnijalt).
 */
export function SettingsEditor({ settings }: { settings: Settings }) {
  const { general, store, delivery, warranty, returns, trustBar } = settings;
  return (
    <div className="flex flex-col gap-6">
      <SettingsGroupForm group="general" title="Üldine" description="Poe nimi ja ettevõtte andmed (jalus, kontaktid). Tühi väli = ei kuvata.">
        {(e) => (
          <>
            <TextField name="storeName" label="Poe nimi" defaultValue={general.storeName} error={e.storeName} />
            <TextField name="supportEmail" label="Klienditoe e-post" type="email" defaultValue={general.supportEmail} error={e.supportEmail} />
            <TextField name="phone" label="Telefon" defaultValue={general.phone} error={e.phone} />
            <TextField name="companyName" label="Ettevõtte nimi" defaultValue={general.companyName} error={e.companyName} />
            <TextField name="registryCode" label="Registrikood" defaultValue={general.registryCode} error={e.registryCode} />
            <TextField name="address" label="Aadress" defaultValue={general.address} error={e.address} />
          </>
        )}
      </SettingsGroupForm>

      <SettingsGroupForm group="store" title="Pood" description="Prototüübirežiimis kuvatakse hoiatusriba ja otsingumootorid poodi ei indekseeri.">
        {(e) => (
          <>
            <label className="flex items-center gap-2 text-sm font-medium sm:col-span-2">
              <input type="checkbox" name="prototypeMode" defaultChecked={store.prototypeMode} className="size-4 accent-[var(--c-primary)]" />
              Prototüübirežiim (testandmed, noindex)
            </label>
            <label className="flex flex-col gap-1 text-sm font-medium">
              Valuuta
              <select name="currency" defaultValue={store.currency} className={inputClass}>
                <option value="EUR">EUR (€)</option>
              </select>
              <span className="min-h-4 text-xs text-danger">{e.currency}</span>
            </label>
            <label className="flex flex-col gap-1 text-sm font-medium">
              Keel ja vormingud
              <select name="locale" defaultValue={store.locale} className={inputClass}>
                <option value="et-EE">Eesti (et-EE)</option>
              </select>
              <span className="min-h-4 text-xs text-danger">{e.locale}</span>
            </label>
          </>
        )}
      </SettingsGroupForm>

      <SettingsGroupForm group="delivery" title="Tarne" description="Kassas on praegu üks tarneviis (Standardtarne). Pakiautomaadid lisanduvad koos tarneteenuse ühendamisega.">
        {(e) => (
          <>
            <TextField name="standardShippingName" label="Tarneviisi nimi" defaultValue={delivery.standardShippingName} error={e.standardShippingName} />
            <TextField name="standardShippingPrice" label="Tarne hind (€)" defaultValue={toInput(delivery.standardShippingCents, "euro")} error={e.standardShippingCents} hint="Kassas lisatav summa (0 = tasuta)" />
            <TextArea name="infoText" label="Tarneinfo tekst" defaultValue={delivery.infoText} error={e.infoText} />
            <TextField name="freeShippingThreshold" label="Tasuta tarne alates (€)" defaultValue={toInput(delivery.freeShippingThresholdCents, "euro")} error={e.freeShippingThresholdCents} hint="Tühi = tasuta tarnet pole" />
          </>
        )}
      </SettingsGroupForm>

      <SettingsGroupForm group="warranty" title="Garantii" description="Poe üldised garantiitingimused. Pakkumise garantii pikkus tuleb tarnija andmetest — seda siin ei määrata.">
        {(e) => <TextArea name="text" label="Garantii tekst" defaultValue={warranty.text} error={e.text} hint="Tühi = garantiitingimusi ei kuvata" />}
      </SettingsGroupForm>

      <SettingsGroupForm group="returns" title="Tagastus" description="Tagastustingimused (14-päevane taganemisõigus kehtib seadusest).">
        {(e) => <TextArea name="text" label="Tagastuse tekst" defaultValue={returns.text} error={e.text} />}
      </SettingsGroupForm>

      <SettingsGroupForm group="trustBar" title="Usaldusriba" description="Väited päises ja avalehel. Luba ainult väiteid, mida suudad tõestada.">
        {(e) => (
          <div className="flex flex-col gap-3 sm:col-span-2">
            {trustBar.items.map((item) => (
              <fieldset key={item.key} className="grid gap-2 rounded-md border border-border p-3 sm:grid-cols-[auto_1fr_2fr_80px] sm:items-end">
                <legend className="sr-only">{item.label}</legend>
                <label className="flex h-10 items-center gap-2 text-sm">
                  <input type="checkbox" name={`trust.${item.key}.enabled`} defaultChecked={item.enabled} className="size-4 accent-[var(--c-primary)]" />
                  Nähtav
                </label>
                <label className="flex flex-col gap-1 text-xs text-muted">
                  Pealkiri
                  <input name={`trust.${item.key}.label`} defaultValue={item.label} maxLength={60} className={inputClass} />
                </label>
                <label className="flex flex-col gap-1 text-xs text-muted">
                  Selgitus
                  <input name={`trust.${item.key}.text`} defaultValue={item.text} maxLength={120} className={inputClass} />
                </label>
                <label className="flex flex-col gap-1 text-xs text-muted">
                  Järjekord
                  <input name={`trust.${item.key}.order`} defaultValue={item.order} inputMode="numeric" className={inputClass} />
                </label>
              </fieldset>
            ))}
            {e.items && <p className="text-xs text-danger">{e.items}</p>}
          </div>
        )}
      </SettingsGroupForm>
    </div>
  );
}

"use client";

import { RotateCcw } from "lucide-react";
import { useActionState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { cx } from "@/components/ui/class-names";
import type { ActionResult } from "@/server/admin/action-result";
import { clearOverrideAction } from "@/server/admin/products/actions";
import { useToast } from "./toast";

/**
 * Konfiguratsioonipõhine muutmisvorm (mudel / konfiguratsioon).
 * Tarnija väljade juures näidatakse tarnija väärtust ja kas admin on selle parandanud;
 * "Taasta" eemaldab paranduse (tagasi tarnija väärtusele).
 */

export type FieldType = "text" | "number" | "euro" | "textarea" | "select" | "tri" | "checkbox";

export interface FieldConfig {
  name: string;
  label: string;
  type: FieldType;
  options?: { value: string; label: string }[];
  /** Tarnija väli, mida admin parandab (manual override) */
  overridable?: boolean;
  hint?: string;
  required?: boolean;
  wide?: boolean;
}

export interface FormSection {
  title: string;
  description?: string;
  fields: FieldConfig[];
}

export const inputClass =
  "h-10 w-full rounded-md border border-border-strong bg-surface px-3 text-sm aria-[invalid=true]:border-danger focus-visible:outline-none focus-visible:shadow-[var(--focus-ring)]";

function Control({ field, defaultValue, invalid }: { field: FieldConfig; defaultValue: string; invalid: boolean }) {
  const common = { id: `f-${field.name}`, name: field.name, "aria-invalid": invalid || undefined, "aria-describedby": `f-${field.name}-help` };
  switch (field.type) {
    case "textarea":
      return <textarea {...common} defaultValue={defaultValue} rows={5} className={cx(inputClass, "h-auto py-2")} maxLength={5000} />;
    case "select":
      return (
        <select {...common} defaultValue={defaultValue} className={inputClass}>
          {!field.required && <option value="">— Puudub —</option>}
          {field.options?.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      );
    case "tri":
      return (
        <select {...common} defaultValue={defaultValue} className={inputClass}>
          <option value="">— Teadmata —</option>
          <option value="true">Jah</option>
          <option value="false">Ei</option>
        </select>
      );
    case "checkbox":
      return (
        <label className="flex h-10 items-center gap-2 text-sm">
          <input {...common} type="checkbox" defaultChecked={defaultValue === "true"} className="size-4 accent-[var(--c-primary)]" />
          {field.hint ?? "Jah"}
        </label>
      );
    case "number":
      return <input {...common} type="text" inputMode="decimal" defaultValue={defaultValue} className={inputClass} />;
    case "euro":
      return (
        <div className="relative">
          <input {...common} type="text" inputMode="decimal" defaultValue={defaultValue} className={cx(inputClass, "pr-8")} />
          <span className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-sm text-muted">€</span>
        </div>
      );
    default:
      return <input {...common} type="text" defaultValue={defaultValue} className={inputClass} maxLength={200} />;
  }
}

export function EntityEditForm({
  entity,
  id,
  sections,
  defaults,
  supplier,
  overridden,
  action,
}: {
  entity: "model" | "listing";
  id: string;
  sections: FormSection[];
  defaults: Record<string, string>;
  /** Tarnija väärtus kuvamiseks (vormindatud) */
  supplier: Record<string, string | null>;
  overridden: string[];
  action: (prev: ActionResult | null, formData: FormData) => Promise<ActionResult>;
}) {
  const toast = useToast();
  const [restoring, startRestore] = useTransition();
  const [state, formAction, pending] = useActionState(async (prev: ActionResult | null, formData: FormData) => {
    const result = await action(prev, formData);
    if (result.ok) toast.success(result.message);
    else toast.error(result.error);
    return result;
  }, null);
  const fieldErrors = state && !state.ok ? (state.fieldErrors ?? {}) : {};

  const restore = (field: string) =>
    startRestore(async () => {
      const result = await clearOverrideAction(entity, id, field);
      if (result.ok) toast.success(result.message);
      else toast.error(result.error);
    });

  return (
    <form action={formAction} className="flex flex-col gap-6" noValidate>
      {sections.map((section) => (
        <fieldset key={section.title} className="rounded-lg border border-border bg-surface p-4 sm:p-5">
          <legend className="px-1 font-semibold">{section.title}</legend>
          {section.description && <p className="mb-3 text-sm text-muted">{section.description}</p>}
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {section.fields.map((field) => {
              const isOverridden = overridden.includes(field.name);
              const error = fieldErrors[field.name];
              return (
                <div key={field.name} className={cx("flex min-w-0 flex-col gap-1", field.wide && "sm:col-span-2 xl:col-span-3")}>
                  <div className="flex items-center justify-between gap-2">
                    <label htmlFor={`f-${field.name}`} className="text-sm font-medium">
                      {field.label}
                    </label>
                    {isOverridden && (
                      <span className="rounded bg-primary-soft px-1.5 py-0.5 text-[11px] font-semibold text-primary" title="Admin on tarnija väärtust parandanud">
                        Parandatud
                      </span>
                    )}
                  </div>
                  <Control field={field} defaultValue={defaults[field.name] ?? ""} invalid={Boolean(error)} />
                  <div id={`f-${field.name}-help`} className="min-h-4 text-xs">
                    {error ? (
                      <span className="text-danger">{error}</span>
                    ) : field.overridable ? (
                      <span className="flex flex-wrap items-center gap-x-2 text-muted">
                        Tarnija: {supplier[field.name] ?? <em>puudub</em>}
                        {isOverridden && (
                          <button type="button" onClick={() => restore(field.name)} disabled={restoring} className="inline-flex items-center gap-1 text-primary hover:underline disabled:opacity-50">
                            <RotateCcw className="size-3" aria-hidden /> Taasta
                          </button>
                        )}
                      </span>
                    ) : field.hint && field.type !== "checkbox" ? (
                      <span className="text-muted">{field.hint}</span>
                    ) : null}
                  </div>
                </div>
              );
            })}
          </div>
        </fieldset>
      ))}
      <div className="sticky bottom-0 -mx-4 flex items-center justify-end gap-3 border-t border-border bg-surface/95 px-4 py-3 backdrop-blur lg:-mx-8 lg:px-8">
        {state && !state.ok && <p className="mr-auto text-sm text-danger">{state.error}</p>}
        <Button type="submit" disabled={pending}>
          {pending ? "Salvestan…" : "Salvesta"}
        </Button>
      </div>
    </form>
  );
}

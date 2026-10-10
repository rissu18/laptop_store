"use client";

import { useState, useTransition } from "react";
import type { ActionResult } from "@/server/admin/action-result";
import { ConfirmDialog } from "./confirm-dialog";
import { useToast } from "./toast";

const selector = (form: string) => `input[type=checkbox][form="${form}"][name="ids"]`;

export function RowCheckbox({ form, value }: { form: string; value: string }) {
  return <input type="checkbox" name="ids" value={value} form={form} className="size-4 accent-[var(--c-primary)]" aria-label="Vali rida" />;
}

export function SelectAllCheckbox({ form }: { form: string }) {
  return (
    <input
      type="checkbox"
      className="size-4 accent-[var(--c-primary)]"
      aria-label="Vali kõik read sellel lehel"
      onChange={(event) => {
        document.querySelectorAll<HTMLInputElement>(selector(form)).forEach((box) => (box.checked = event.target.checked));
      }}
    />
  );
}

export interface BulkOption {
  value: string;
  label: string;
}

/**
 * Bulk-toimingud valitud ridadele. Kustutamist pole (ainult aktiveeri/peida/esiletõst) — andmed jäävad alles.
 * Iga toiming küsib kinnitust ja server kontrollib uuesti õigusi ning sisendit.
 */
export function BulkActionBar({ formId, options, action, entityLabel }: { formId: string; options: BulkOption[]; action: (formData: FormData) => Promise<ActionResult>; entityLabel: string }) {
  const toast = useToast();
  const [pending, startTransition] = useTransition();
  const [confirm, setConfirm] = useState<{ ids: string[]; operation: BulkOption } | null>(null);

  const run = () => {
    if (!confirm) return;
    const formData = new FormData();
    formData.set("operation", confirm.operation.value);
    for (const id of confirm.ids) formData.append("ids", id);
    startTransition(async () => {
      const result = await action(formData);
      if (result.ok) {
        toast.success(result.message);
        document.querySelectorAll<HTMLInputElement>(selector(formId)).forEach((box) => (box.checked = false));
      } else toast.error(result.error);
      setConfirm(null);
    });
  };

  return (
    <>
      <form
        id={formId}
        className="flex flex-wrap items-center gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          const ids = [...new Set([...document.querySelectorAll<HTMLInputElement>(`${selector(formId)}:checked`)].map((box) => box.value))];
          const value = new FormData(event.currentTarget).get("operation");
          const operation = options.find((o) => o.value === value);
          if (!ids.length) return toast.error("Vali enne vähemalt üks rida.");
          if (!operation) return toast.error("Vali toiming.");
          setConfirm({ ids, operation });
        }}
      >
        <label className="sr-only" htmlFor={`${formId}-op`}>
          Toiming valitud ridadele
        </label>
        <select id={`${formId}-op`} name="operation" defaultValue="" className="h-9 rounded-md border border-border-strong bg-surface px-2 text-sm">
          <option value="" disabled>
            Valitud ridadega…
          </option>
          {options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        <button type="submit" className="h-9 rounded-md border border-border-strong bg-surface px-3 text-sm font-medium hover:border-text">
          Rakenda
        </button>
      </form>
      <ConfirmDialog
        open={confirm !== null}
        title="Kinnita bulk-muudatus"
        confirmLabel={confirm?.operation.label}
        pending={pending}
        onConfirm={run}
        onCancel={() => setConfirm(null)}
      >
        <p>
          Toiming <strong>{confirm?.operation.label}</strong> rakendatakse {confirm?.ids.length} {entityLabel} kohta. Muudatus salvestatakse tegevuslogisse.
        </p>
      </ConfirmDialog>
    </>
  );
}

"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { lookupOrderAction, type LookupState } from "@/server/checkout/checkout-actions";
import { OrderDetails } from "./order-details";

/** Tellimuse otsing: number + e-post peavad mõlemad klappima. Vastus on üldine, kui ei klapi. */
export function OrderLookupForm() {
  const [state, formAction, pending] = useActionState<LookupState, FormData>(lookupOrderAction, { submitted: false });
  const inputClass = "mt-1 h-11 w-full rounded-md border border-border-strong bg-surface px-3 text-base sm:text-sm";

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-8">
      <div className="mx-auto w-full max-w-md">
        <h1 className="text-3xl font-bold tracking-tight">Tellimuse otsing</h1>
        <p className="mt-2 text-muted">Sisesta tellimuse number ja e-posti aadress, mida kasutasid tellimisel.</p>
        <form action={formAction} className="mt-8 space-y-4">
          <label className="block text-sm font-medium">
            Tellimuse number
            <input name="orderNumber" defaultValue={state.submitted ? state.values.orderNumber : ""} required maxLength={20} autoCapitalize="characters" className={`${inputClass} font-mono uppercase`} placeholder="nt SL-26-A7K4P9" />
          </label>
          <label className="block text-sm font-medium">
            E-post
            <input name="email" defaultValue={state.submitted ? state.values.email : ""} type="email" required autoComplete="email" maxLength={200} className={inputClass} />
          </label>
          {state.submitted && !state.ok && (
            <p role="alert" className="rounded-md bg-danger-soft px-3 py-2 text-sm text-danger">
              {state.message}
            </p>
          )}
          <Button type="submit" fullWidth size="lg" disabled={pending}>
            {pending ? "Otsin…" : "Otsi tellimust"}
          </Button>
        </form>
      </div>
      {state.submitted && state.ok && (
        <section aria-label="Tellimus">
          {state.order.isTest && (
            <p role="note" className="mb-4 rounded-md bg-warning-soft px-3 py-2 text-sm font-semibold text-warning">
              TEST — prototüübi testtellimus. Makset ei võetud ja tellimust ei täideta.
            </p>
          )}
          <OrderDetails order={state.order} />
        </section>
      )}
    </div>
  );
}

"use client";

import { XCircle } from "lucide-react";
import { useActionState, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import type { ActionResult } from "@/server/admin/action-result";
import { addOrderNoteAction, cancelOrderAction } from "@/server/admin/orders/actions";
import { ConfirmDialog } from "./confirm-dialog";
import { inputClass } from "./entity-form";
import { useToast } from "./toast";

/** Tellimuse tühistamine kinnitusega. Muid olekumuutusi (nt PAID) adminis selles faasis pole. */
export function CancelOrderButton({ id, orderNumber, isTest }: { id: string; orderNumber: string; isTest: boolean }) {
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [pending, startTransition] = useTransition();
  return (
    <>
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
        <XCircle className="size-4" aria-hidden /> Tühista tellimus
      </Button>
      <ConfirmDialog
        open={open}
        title="Kas oled kindel?"
        confirmLabel="Tühista tellimus"
        tone="danger"
        pending={pending}
        onCancel={() => setOpen(false)}
        onConfirm={() =>
          startTransition(async () => {
            const result = await cancelOrderAction(id, reason);
            if (result.ok) toast.success(result.message);
            else toast.error(result.error);
            setOpen(false);
          })
        }
      >
        <p>
          Tellimus <strong>{orderNumber}</strong> tühistatakse. Seda ei saa tagasi võtta. Muudatus salvestatakse tellimuse ajalukku ja tegevuslogisse.
        </p>
        {isTest && <p className="text-muted">Testtellimus: laoseisu ei vähendatud, seega midagi taastama ei pea.</p>}
        <label className="flex flex-col gap-1 font-medium">
          Põhjus (valikuline, ainult sisemine)
          <input value={reason} onChange={(e) => setReason(e.target.value)} maxLength={500} className={inputClass} />
        </label>
      </ConfirmDialog>
    </>
  );
}

export function OrderNoteForm({ id }: { id: string }) {
  const toast = useToast();
  // Vormi lähtestamine pärast edukat salvestust (uus key → tühi tekstikast)
  const [formKey, setFormKey] = useState(0);
  const [state, formAction, pending] = useActionState(async (prev: ActionResult | null, formData: FormData) => {
    const result = await addOrderNoteAction(id, prev, formData);
    if (result.ok) {
      toast.success(result.message);
      setFormKey((k) => k + 1);
    } else toast.error(result.error);
    return result;
  }, null);
  return (
    <form action={formAction} key={formKey} className="flex flex-col gap-2">
      <label htmlFor="order-note" className="text-sm font-medium">
        Lisa sisemärkus
      </label>
      <textarea id="order-note" name="note" rows={3} maxLength={2000} required className={`${inputClass} h-auto py-2`} placeholder="nt Klient helistas." />
      {state && !state.ok && <p className="text-xs text-danger">{state.error}</p>}
      <p className="text-xs text-muted">Kliendile ei näidata. Märkusi ei saa muuta ega kustutada.</p>
      <Button type="submit" size="sm" disabled={pending} className="self-start">
        {pending ? "Salvestan…" : "Lisa märkus"}
      </Button>
    </form>
  );
}

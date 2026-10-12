"use client";

import { X } from "lucide-react";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { assignOrderUnitAction, unassignOrderUnitAction } from "@/server/admin/orders/actions";
import { inputClass } from "./entity-form";
import { useToast } from "./toast";

export interface OrderUnitsRow {
  itemId: string;
  title: string;
  quantity: number;
  assigned: { assignmentId: string; externalUnitId: string; serialNumber: string | null; available: boolean; status: string; adminEmail: string | null }[];
  candidates: { id: string; externalUnitId: string; serialNumber: string | null }[];
}

/**
 * Tellimuse rea füüsilised seadmed (Tech ID + seerianumber) — AINULT admin. Kogus 3 → 3 eri seadet.
 * Märge ei reserveeri ega müü seadet (testtellimus ei kuluta laoseisu); kliendile seerianumbreid ei näidata.
 */
export function OrderUnits({ orderId, rows }: { orderId: string; rows: OrderUnitsRow[] }) {
  return (
    <div className="flex flex-col gap-5">
      {rows.map((row) => (
        <OrderItemUnits key={row.itemId} orderId={orderId} row={row} />
      ))}
    </div>
  );
}

function OrderItemUnits({ orderId, row }: { orderId: string; row: OrderUnitsRow }) {
  const toast = useToast();
  const [selected, setSelected] = useState("");
  const [pending, startTransition] = useTransition();
  const run = (action: () => Promise<{ ok: true; message: string } | { ok: false; error: string }>) =>
    startTransition(async () => {
      const result = await action();
      if (result.ok) toast.success(result.message);
      else toast.error(result.error);
      setSelected("");
    });
  const assignedIds = new Set(row.assigned.map((a) => a.externalUnitId));
  const candidates = row.candidates.filter((c) => !assignedIds.has(c.externalUnitId));
  const missing = row.quantity - row.assigned.length;

  return (
    <div className="text-sm">
      <p className="font-medium">
        {row.title} <span className="text-muted">— määratud {row.assigned.length} / {row.quantity}</span>
      </p>
      {row.assigned.length > 0 && (
        <ul className="mt-2 divide-y divide-border rounded-md border border-border">
          {row.assigned.map((unit) => (
            <li key={unit.assignmentId} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2">
              <span>
                <span className="font-mono">{unit.serialNumber ?? "—"}</span> <span className="text-xs text-muted">Tech ID {unit.externalUnitId}</span>
                {!unit.available && <span className="ml-2 text-xs text-warning">(praegu mitte müügis: {unit.status})</span>}
              </span>
              <Button variant="ghost" size="sm" disabled={pending} onClick={() => run(() => unassignOrderUnitAction(orderId, unit.assignmentId))} aria-label={`Eemalda seade ${unit.externalUnitId}`}>
                <X className="size-4" aria-hidden /> Eemalda
              </Button>
            </li>
          ))}
        </ul>
      )}
      {missing > 0 &&
        (candidates.length ? (
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <label className="sr-only" htmlFor={`unit-${row.itemId}`}>
              Vali seade
            </label>
            <select id={`unit-${row.itemId}`} value={selected} onChange={(e) => setSelected(e.target.value)} className={`${inputClass} max-w-xs`} disabled={pending}>
              <option value="">Vali seerianumber…</option>
              {candidates.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.serialNumber ?? "—"} (Tech ID {c.externalUnitId})
                </option>
              ))}
            </select>
            <Button size="sm" disabled={!selected || pending} onClick={() => run(() => assignOrderUnitAction(orderId, row.itemId, selected))}>
              Määra seade
            </Button>
          </div>
        ) : (
          <p className="mt-2 text-xs text-muted">Selle konfiguratsiooni alla pole praegu müügis seadmeid, mida määrata.</p>
        ))}
    </div>
  );
}

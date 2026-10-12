"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { PROCUREMENT_STATUS_VALUES, procurementStatusLabel, type ProcurementStatusValue } from "@/domain/orders/procurement";
import { formatEur } from "@/domain/money/money";
import { formatTallinnDateTime } from "@/domain/time/tallinn";
import { updateProcurementAction } from "@/server/admin/orders/actions";
import type { ActionResult } from "@/server/admin/action-result";
import { inputClass } from "./entity-form";
import { useToast } from "./toast";

export interface ProcurementView {
  item: { id: string; title: string; model: string; sku: string; quantity: number; unitPriceCents: number };
  procurement: {
    id: string;
    supplier: string;
    supplierSku: string;
    supplierVariantId: string | null;
    supplierProductName: string | null;
    supplierListedPriceCents: number | null;
    supplierCurrency: string | null;
    supplierVatMargin: boolean | null;
    status: ProcurementStatusValue;
    supplierOrderReference: string | null;
    note: string | null;
    actualPurchasePriceCents: number | null;
    supplierSerial: string | null;
    orderedAt: Date | null;
    supplierShippedAt: Date | null;
    receivedAt: Date | null;
    updatedBy: string | null;
  };
}

const eurosInput = (cents: number | null) => (cents === null ? "" : (cents / 100).toFixed(2).replace(".", ","));
const SUPPLIER_NAMES: Record<string, string> = { foxway: "FOXWAY" };

/**
 * Tellimuse rida, mis tuleb tarnijalt käsitsi tellida (nt Foxway): mida tellida (SKU, ItemVariantId, kogus) ja hanke
 * seis. Foxway poole midagi automaatselt ei saadeta.
 */
export function OrderProcurementRow({ orderId, row, isTest }: { orderId: string; row: ProcurementView; isTest: boolean }) {
  const toast = useToast();
  const { item, procurement: p } = row;
  const [state, formAction, pending] = useActionState(async (prev: ActionResult | null, formData: FormData) => {
    const result = await updateProcurementAction(orderId, p.id, prev, formData);
    if (result.ok) toast.success(result.message);
    else toast.error(result.error);
    return result;
  }, null);

  return (
    <div className="rounded-lg border border-border p-4">
      <dl className="grid gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
        <div className="flex gap-2"><dt className="text-muted">Tarnija:</dt><dd className="font-semibold">{SUPPLIER_NAMES[p.supplier] ?? p.supplier}</dd></div>
        <div className="flex gap-2"><dt className="text-muted">SKU:</dt><dd className="font-mono">{p.supplierSku}</dd></div>
        <div className="flex gap-2"><dt className="text-muted">ItemVariantId:</dt><dd className="font-mono">{p.supplierVariantId ?? "—"}</dd></div>
        <div className="flex gap-2"><dt className="text-muted">Kogus:</dt><dd className="font-semibold">{item.quantity} tk</dd></div>
        <div className="flex gap-2 sm:col-span-2"><dt className="text-muted">Toode:</dt><dd>{item.title} <span className="text-xs text-muted">({p.supplierProductName ?? item.model}; meie SKU {item.sku})</span></dd></div>
        <div className="flex gap-2">
          <dt className="text-muted">Tarnija hinnakirja hind (tellimuse hetkel):</dt>
          <dd>
            {p.supplierListedPriceCents !== null ? `${formatEur(p.supplierListedPriceCents)}${p.supplierCurrency && p.supplierCurrency !== "EUR" ? ` ${p.supplierCurrency}` : ""}${p.supplierVatMargin ? "" : " + KM"}` : "—"}
          </dd>
        </div>
        <div className="flex gap-2">
          <dt className="text-muted">Tarnija KM tüüp:</dt>
          <dd>{p.supplierVatMargin === null ? "—" : p.supplierVatMargin ? "IsVatMargin — kasutatud kauba erikord" : "Tavaline KM"}</dd>
        </div>
        <div className="flex gap-2"><dt className="text-muted">Kliendi müügihind:</dt><dd>{formatEur(item.unitPriceCents)} / tk</dd></div>
      </dl>
      {isTest && <p className="mt-2 text-xs text-warning">Testtellimus — tarnijalt ei tellita.</p>}
      <form action={formAction} className="mt-3 grid gap-3 sm:grid-cols-2">
        <label className="flex flex-col gap-1 text-sm font-medium">
          Hanke seis
          <select name="status" defaultValue={p.status} className={inputClass}>
            {PROCUREMENT_STATUS_VALUES.map((status) => (
              <option key={status} value={status}>
                {procurementStatusLabel(status, p.supplier)}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-sm font-medium">
          Tarnija tellimuse viide
          <input name="supplierOrderReference" defaultValue={p.supplierOrderReference ?? ""} maxLength={120} className={inputClass} placeholder="nt Foxway SO number" />
        </label>
        <label className="flex flex-col gap-1 text-sm font-medium">
          Tegelik ostuhind (€ / tk, ilma KM-ita)
          <input name="actualPurchasePriceCents" defaultValue={eurosInput(p.actualPurchasePriceCents)} inputMode="decimal" className={inputClass} placeholder="tühi = teadmata" />
          <span className="text-xs font-normal text-muted">Võib erineda hinnakirja hinnast (erihind).</span>
        </label>
        <label className="flex flex-col gap-1 text-sm font-medium">
          Seerianumber (valikuline)
          <input name="supplierSerial" defaultValue={p.supplierSerial ?? ""} maxLength={120} className={inputClass} />
        </label>
        <label className="flex flex-col gap-1 text-sm font-medium sm:col-span-2">
          Märkus
          <textarea name="note" defaultValue={p.note ?? ""} rows={2} maxLength={2000} className={`${inputClass} h-auto py-2`} />
        </label>
        <div className="flex flex-wrap items-center gap-3 sm:col-span-2">
          <Button type="submit" size="sm" disabled={pending}>
            {pending ? "Salvestan…" : "Salvesta hanke seis"}
          </Button>
          <span className="text-xs text-muted">
            {[p.orderedAt && `tellitud ${formatTallinnDateTime(p.orderedAt)}`, p.supplierShippedAt && `saadetud ${formatTallinnDateTime(p.supplierShippedAt)}`, p.receivedAt && `kohal ${formatTallinnDateTime(p.receivedAt)}`, p.updatedBy && `muutis ${p.updatedBy}`]
              .filter(Boolean)
              .join(" · ")}
          </span>
          {state && !state.ok && <span className="text-xs text-danger">{state.error}</span>}
        </div>
      </form>
    </div>
  );
}

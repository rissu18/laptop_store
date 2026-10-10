"use client";

import { Archive, Copy, Pause, Pencil, Play } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { cx } from "@/components/ui/class-names";
import type { ActionResult } from "@/server/admin/action-result";
import { duplicateDiscountAction, setDiscountStatusAction } from "@/server/admin/discounts/actions";
import { ConfirmDialog } from "./confirm-dialog";
import { useToast } from "./toast";

/**
 * Sooduskoodi kiirtoimingud (nimekirjas ja detailvaates): muuda, duplikeeri, aktiveeri/lülita välja, arhiveeri.
 * Arhiveerimine küsib kinnitust. Kustutamist pole — kasutatud koodid peavad ajaloos alles jääma.
 */
export function DiscountActions({ id, code, status, compact, showEdit = true }: { id: string; code: string; status: string; compact?: boolean; showEdit?: boolean }) {
  const toast = useToast();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [confirmArchive, setConfirmArchive] = useState(false);

  const run = (task: () => Promise<ActionResult & { id?: string }>, navigateToNew = false) =>
    startTransition(async () => {
      const result = await task();
      if (result.ok) {
        toast.success(result.message);
        if (navigateToNew && result.id) router.push(`/admin/discounts/${result.id}`);
      } else toast.error(result.error);
    });

  const button = cx(
    "inline-flex min-h-9 items-center gap-1.5 rounded-md border border-border bg-surface px-2.5 text-sm text-text hover:border-border-strong disabled:opacity-40",
    compact && "px-2",
  );
  const label = (text: string) => <span className={compact ? "sr-only xl:not-sr-only" : undefined}>{text}</span>;
  const archived = status === "ARCHIVED";

  return (
    <div className="flex flex-wrap gap-1.5">
      {showEdit && !archived && (
        <Link href={`/admin/discounts/${id}`} className={button} title="Muuda">
          <Pencil className="size-4" aria-hidden /> {label("Muuda")}
        </Link>
      )}
      <button type="button" className={button} disabled={pending} onClick={() => run(() => duplicateDiscountAction(id), true)} title="Duplikeeri">
        <Copy className="size-4" aria-hidden /> {label("Duplikeeri")}
      </button>
      {(status === "DRAFT" || status === "DISABLED") && (
        <button type="button" className={button} disabled={pending} onClick={() => run(() => setDiscountStatusAction(id, "ACTIVE"))} title="Aktiveeri">
          <Play className="size-4" aria-hidden /> {label("Aktiveeri")}
        </button>
      )}
      {status === "ACTIVE" && (
        <button type="button" className={button} disabled={pending} onClick={() => run(() => setDiscountStatusAction(id, "DISABLED"))} title="Lülita välja">
          <Pause className="size-4" aria-hidden /> {label("Lülita välja")}
        </button>
      )}
      {!archived && (
        <button type="button" className={button} disabled={pending} onClick={() => setConfirmArchive(true)} title="Arhiveeri">
          <Archive className="size-4" aria-hidden /> {label("Arhiveeri")}
        </button>
      )}
      <ConfirmDialog
        open={confirmArchive}
        title={`Arhiveeri ${code}?`}
        confirmLabel="Arhiveeri"
        tone="danger"
        pending={pending}
        onCancel={() => setConfirmArchive(false)}
        onConfirm={() => {
          setConfirmArchive(false);
          run(() => setDiscountStatusAction(id, "ARCHIVED"));
        }}
      >
        <p>Arhiveeritud kood lakkab kohe töötamast ja seda ei saa enam muuta. Kood jääb andmebaasi (ajalugu ja tellimused säilivad) ning sama koodi teksti ei saa uuesti kasutada.</p>
        <p className="text-muted">Kampaania kordamiseks kasuta „Duplikeeri“.</p>
      </ConfirmDialog>
    </div>
  );
}

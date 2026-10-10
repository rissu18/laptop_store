"use client";

import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";

/** Kinnitusdialoog olulistele/pöördumatutele toimingutele (nt hindade rakendamine, bulk-muudatused). */
export function ConfirmDialog({
  open,
  title,
  children,
  confirmLabel = "Kinnita",
  tone = "primary",
  pending,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  children: ReactNode;
  confirmLabel?: string;
  tone?: "primary" | "danger";
  pending?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <Dialog
      open={open}
      onClose={onCancel}
      title={title}
      footer={
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button variant="outline" onClick={onCancel} disabled={pending}>
            Loobu
          </Button>
          <Button onClick={onConfirm} disabled={pending} className={tone === "danger" ? "bg-danger hover:bg-danger/90" : undefined}>
            {pending ? "Töötlen…" : confirmLabel}
          </Button>
        </div>
      }
    >
      <div className="space-y-3 px-5 pt-4 text-sm">{children}</div>
    </Dialog>
  );
}

"use client";

import { CheckCircle2, AlertTriangle, X } from "lucide-react";
import { createContext, use, useCallback, useState, type ReactNode } from "react";
import { cx } from "@/components/ui/class-names";

type ToastKind = "success" | "error";
interface ToastItem {
  id: number;
  kind: ToastKind;
  message: string;
}

const ToastContext = createContext<((kind: ToastKind, message: string) => void) | null>(null);

let nextId = 1;

/** Lühiteated (salvestatud / viga). Ekraanilugejale aria-live kaudu. */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const dismiss = useCallback((id: number) => setToasts((list) => list.filter((t) => t.id !== id)), []);
  const show = useCallback(
    (kind: ToastKind, message: string) => {
      const id = nextId++;
      setToasts((list) => [...list.slice(-3), { id, kind, message }]);
      setTimeout(() => dismiss(id), kind === "error" ? 8000 : 4000);
    },
    [dismiss],
  );

  return (
    <ToastContext value={show}>
      {children}
      <div aria-live="polite" className="pointer-events-none fixed inset-x-0 bottom-4 z-[60] flex flex-col items-center gap-2 px-4 sm:items-end sm:pr-6">
        {toasts.map((toast) => (
          <div
            key={toast.id}
            role={toast.kind === "error" ? "alert" : "status"}
            className={cx(
              "pointer-events-auto flex w-full max-w-sm items-start gap-3 rounded-md border bg-surface px-4 py-3 text-sm shadow-lg",
              toast.kind === "error" ? "border-danger/40" : "border-success/40",
            )}
          >
            {toast.kind === "error" ? (
              <AlertTriangle className="mt-0.5 size-4 shrink-0 text-danger" aria-hidden />
            ) : (
              <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-success" aria-hidden />
            )}
            <p className="flex-1">{toast.message}</p>
            <button type="button" onClick={() => dismiss(toast.id)} className="-m-1 rounded p-1 text-muted hover:text-text" aria-label="Sulge teade">
              <X className="size-4" aria-hidden />
            </button>
          </div>
        ))}
      </div>
    </ToastContext>
  );
}

export function useToast() {
  const show = use(ToastContext);
  if (!show) throw new Error("useToast vajab ToastProvider'it");
  return { success: (message: string) => show("success", message), error: (message: string) => show("error", message) };
}

"use client";

import { X } from "lucide-react";
import { useEffect, useId, useRef, type ReactNode } from "react";
import { cx } from "./class-names";

/**
 * Natiivsel <dialog> elemendil põhinev modal/drawer.
 * Brauser hoolitseb fookuse lõksu, Esc-klahvi ja ligipääsetavuse eest.
 */

type Variant = "modal" | "drawer-left" | "drawer-right" | "sheet" | "fullscreen";

const VARIANTS: Record<Variant, string> = {
  modal: "m-auto w-[calc(100%-2rem)] max-w-lg rounded-lg max-h-[85vh]",
  "drawer-left": "my-0 ml-0 mr-auto h-dvh max-h-dvh w-[88vw] max-w-sm",
  "drawer-right": "my-0 mr-0 ml-auto h-dvh max-h-dvh w-[92vw] max-w-md",
  // Mobiilis alt üles libisev leht, suuremal ekraanil paremal drawer
  sheet:
    "mb-0 mt-auto mx-0 w-full max-w-none max-h-[90dvh] rounded-t-xl sm:my-0 sm:mr-0 sm:ml-auto sm:h-dvh sm:max-h-dvh sm:max-w-md sm:rounded-none",
  fullscreen: "m-0 h-dvh max-h-none w-screen max-w-none bg-text",
};

interface DialogProps {
  open: boolean;
  onClose: () => void;
  title: string;
  /** Peida pealkiri visuaalselt (jääb ekraanilugejale) */
  hideTitle?: boolean;
  variant?: Variant;
  footer?: ReactNode;
  children: ReactNode;
  className?: string;
}

export function Dialog({ open, onClose, title, hideTitle, variant = "modal", footer, children, className }: DialogProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      dialog.showModal();
      document.documentElement.style.overflow = "hidden";
    } else if (!open && dialog.open) {
      dialog.close();
    }
    return () => {
      document.documentElement.style.overflow = "";
    };
  }, [open]);

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      onClose={() => {
        document.documentElement.style.overflow = "";
        onClose();
      }}
      // Klikk tumedale taustale sulgeb
      onClick={(event) => event.target === ref.current && onClose()}
      className={cx(
        "flex-col overflow-hidden bg-surface p-0 text-text shadow-lg open:flex",
        VARIANTS[variant],
        className,
      )}
    >
      <div
        className={cx(
          "flex items-center justify-between gap-4 border-b border-border px-5 py-4",
          hideTitle && "sr-only",
          variant === "fullscreen" && "border-white/10 text-white",
        )}
      >
        <h2 id={titleId} className="text-lg font-semibold">
          {title}
        </h2>
        <button
          type="button"
          onClick={onClose}
          className="-mr-2 rounded-md p-2 text-muted hover:bg-surface-sunken hover:text-text"
          aria-label="Sulge"
        >
          <X className="size-5" aria-hidden />
        </button>
      </div>
      <div className="flex-1 overflow-y-auto overscroll-contain">{children}</div>
      {footer && <div className="border-t border-border bg-surface px-5 py-4">{footer}</div>}
    </dialog>
  );
}

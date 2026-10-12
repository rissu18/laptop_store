"use client";

import { Info } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import { cx } from "./class-names";

/**
 * Väike info-ikoon selgitusega.
 * - Desktop: hover ja klaviatuuri fookus näitavad selgitust (CSS group-hover / group-focus-within).
 * - Mobiil: puudutus (klõps) avab/sulgeb; Escape ja klõps mujal sulgevad.
 * - Ekraanilugeja: nupul on nimi (`label`) ja selgitus on seotud aria-describedby kaudu (loetakse ka peidetuna).
 */
export function InfoTip({ label, children, className }: { label: string; children: React.ReactNode; className?: string }) {
  const [open, setOpen] = useState(false);
  const id = useId();
  const root = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => event.key === "Escape" && setOpen(false);
    const onPointer = (event: PointerEvent) => {
      if (root.current && !root.current.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onPointer);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onPointer);
    };
  }, [open]);

  return (
    <span ref={root} className={cx("group relative inline-flex align-middle", className)}>
      <button
        type="button"
        aria-label={label}
        aria-describedby={id}
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
        className="inline-flex size-6 items-center justify-center rounded-full text-muted hover:text-text focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-primary"
      >
        <Info className="size-4" aria-hidden />
      </button>
      <span
        id={id}
        role="tooltip"
        className={cx(
          "absolute bottom-full left-1/2 z-20 mb-2 w-64 max-w-[calc(100vw-2rem)] -translate-x-1/2 rounded-md border border-border bg-surface p-3 text-left text-xs font-normal leading-snug text-body shadow-lg",
          "transition-opacity duration-100",
          open ? "visible opacity-100" : "invisible opacity-0 group-hover:visible group-hover:opacity-100 group-focus-within:visible group-focus-within:opacity-100",
        )}
      >
        {children}
      </span>
    </span>
  );
}

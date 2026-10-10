"use client";

import { GitCompareArrows, X } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { MAX_COMPARE, clearCompare, useCompare } from "@/client/compare-store";
import { buttonClasses } from "@/components/ui/button";

/** Kleepuv võrdlusriba lehe allservas, kui võrdlusesse on lisatud vähemalt üks toode. */
export function CompareBar() {
  const ids = useCompare();
  const pathname = usePathname();
  if (ids.length === 0 || pathname === "/vordlus") return null;

  return (
    <div data-compare-bar className="fixed inset-x-0 bottom-0 z-30 px-4 pb-4 transition-[bottom]">
      <div className="mx-auto flex max-w-xl items-center gap-3 rounded-lg border border-border bg-surface p-3 shadow-lg">
        <GitCompareArrows className="size-5 shrink-0 text-primary" aria-hidden />
        <p className="flex-1 text-sm">
          <span className="font-semibold">Võrdluses {ids.length}</span>
          <span className="text-muted"> / {MAX_COMPARE}</span>
          {ids.length === 1 && <span className="hidden text-muted sm:inline"> · lisa veel vähemalt üks</span>}
        </p>
        <button type="button" onClick={clearCompare} className="rounded-md p-2 text-muted hover:bg-surface-sunken hover:text-text" aria-label="Tühjenda võrdlus">
          <X className="size-4" aria-hidden />
        </button>
        <Link href="/vordlus" className={buttonClasses({ size: "sm" })}>
          Võrdle
        </Link>
      </div>
    </div>
  );
}

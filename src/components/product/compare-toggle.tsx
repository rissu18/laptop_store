"use client";

import { useState } from "react";
import { MAX_COMPARE, toggleCompare, useCompare } from "@/client/compare-store";
import { cx } from "@/components/ui/class-names";

/** "Võrdle" märkeruut. Max 4 toodet. */
export function CompareToggle({ variantId, className }: { variantId: string; className?: string }) {
  const ids = useCompare();
  const [full, setFull] = useState(false);
  const checked = ids.includes(variantId);

  return (
    <label
      className={cx(
        "z-10 inline-flex cursor-pointer select-none items-center gap-2 rounded-md text-sm",
        checked ? "font-semibold text-primary" : "text-muted hover:text-text",
        className,
      )}
    >
      <input
        type="checkbox"
        checked={checked}
        onChange={() => setFull(!toggleCompare(variantId))}
        className="size-4 rounded border-border-strong accent-[var(--c-primary)]"
      />
      Võrdle
      {full && !checked && (
        <span role="alert" className="text-xs font-normal text-danger">
          (max {MAX_COMPARE})
        </span>
      )}
    </label>
  );
}

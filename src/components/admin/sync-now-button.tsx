"use client";

import { RefreshCw } from "lucide-react";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { syncLaptopidNowAction } from "@/server/admin/suppliers/actions";
import { useToast } from "./toast";

/** "Sync now" + valikuline kinnitus, et suur hulk puuduvaid tooteid võib maha võtta. */
export function SyncNowButton({ disabled }: { disabled?: boolean }) {
  const toast = useToast();
  const [allowLargeDrop, setAllowLargeDrop] = useState(false);
  const [pending, startTransition] = useTransition();

  return (
    <div className="flex flex-col gap-3">
      <Button
        type="button"
        disabled={disabled || pending}
        onClick={() =>
          startTransition(async () => {
            const result = await syncLaptopidNowAction(allowLargeDrop);
            if (result.ok) toast.success(result.message);
            else toast.error(result.error);
            setAllowLargeDrop(false);
          })
        }
      >
        <RefreshCw className={pending ? "size-4 animate-spin" : "size-4"} aria-hidden />
        {pending ? "Sünkroniseerin…" : "Sync now"}
      </Button>
      <label className="flex items-start gap-2 text-sm text-muted">
        <input type="checkbox" className="mt-0.5" checked={allowLargeDrop} onChange={(e) => setAllowLargeDrop(e.target.checked)} disabled={pending} />
        <span>Luba suur muutus — kinnitan, et paljud tooted on Laptopid.ee nimekirjast päriselt kadunud (muidu jäetakse need ohutuse mõttes saadavaks).</span>
      </label>
    </div>
  );
}

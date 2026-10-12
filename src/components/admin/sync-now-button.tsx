"use client";

import { RefreshCw } from "lucide-react";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { syncLaptopidNowAction, syncTechNowAction } from "@/server/admin/suppliers/actions";
import { useToast } from "./toast";

const SUPPLIERS = {
  laptopid: { action: syncLaptopidNowAction, largeDropLabel: "Luba suur muutus — kinnitan, et paljud tooted on Laptopid.ee nimekirjast päriselt kadunud (muidu jäetakse need ohutuse mõttes saadavaks)." },
  tech: { action: syncTechNowAction, largeDropLabel: "Luba suur muutus — kinnitan, et paljud seadmed on Techi hinnakirjas päriselt müüdud või kadunud (muidu sync peatub ja kataloog jääb samaks)." },
};

/** "Sync now" + valikuline kinnitus, et suur hulk puuduvaid tooteid võib maha võtta. */
export function SyncNowButton({ disabled, supplier = "laptopid" }: { disabled?: boolean; supplier?: keyof typeof SUPPLIERS }) {
  const { action, largeDropLabel } = SUPPLIERS[supplier];
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
            const result = await action(allowLargeDrop);
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
        <span>{largeDropLabel}</span>
      </label>
    </div>
  );
}

"use client";

import { RefreshCw } from "lucide-react";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { syncFoxwayNowAction, syncLaptopidNowAction, syncTechNowAction } from "@/server/admin/suppliers/actions";
import { ConfirmDialog } from "./confirm-dialog";
import { useToast } from "./toast";

const SUPPLIERS = {
  laptopid: {
    name: "Laptopid.ee",
    action: syncLaptopidNowAction,
    source: "Laptopid.ee API",
    safeguard: "Ei — kui korraga kaoks liiga palju pakkumisi, jäetakse need ohutuse mõttes müüki.",
    largeDropLabel: "Luba suur muutus — kinnitan, et paljud tooted on Laptopid.ee nimekirjast päriselt kadunud (muidu jäetakse need ohutuse mõttes saadavaks).",
  },
  foxway: {
    name: "Foxway",
    action: syncFoxwayNowAction,
    source: "Foxway API (4 hinnakirja)",
    safeguard: "Ei — kui korraga kaoks liiga palju SKU-sid, jäetakse need ohutuse mõttes müüki.",
    largeDropLabel: "Luba suur muutus — kinnitan, et paljud SKU-d on Foxway hinnakirjast päriselt kadunud (muidu jäetakse need ohutuse mõttes saadavaks).",
  },
  tech: {
    name: "Techvision",
    action: syncTechNowAction,
    source: "Techvisioni hinnakiri (Google Sheets XLSX)",
    safeguard: "Ei — kui korraga kaoks müügist üle poole seadmetest, sync peatub ja kataloog jääb samaks.",
    largeDropLabel: "Luba suur muutus — kinnitan, et paljud seadmed on Techi hinnakirjas päriselt müüdud või kadunud (muidu sync peatub ja kataloog jääb samaks).",
  },
};

/** "Sync now" kinnitusega (tarnija, suure muutuse luba, mis juhtub) + valikuline luba suureks mahavõtmiseks. */
export function SyncNowButton({ disabled, supplier = "laptopid" }: { disabled?: boolean; supplier?: keyof typeof SUPPLIERS }) {
  const { name, action, source, safeguard, largeDropLabel } = SUPPLIERS[supplier];
  const toast = useToast();
  const [allowLargeDrop, setAllowLargeDrop] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [pending, startTransition] = useTransition();

  return (
    <div className="flex flex-col gap-3">
      <Button type="button" disabled={disabled || pending} onClick={() => setConfirming(true)}>
        <RefreshCw className={pending ? "size-4 animate-spin" : "size-4"} aria-hidden />
        {pending ? "Sünkroniseerin…" : "Sync now"}
      </Button>
      <label className="flex items-start gap-2 text-sm text-muted">
        <input type="checkbox" className="mt-0.5" checked={allowLargeDrop} onChange={(e) => setAllowLargeDrop(e.target.checked)} disabled={pending} />
        <span>{largeDropLabel}</span>
      </label>
      <ConfirmDialog
        open={confirming}
        title={`Käivita ${name} sync?`}
        confirmLabel={allowLargeDrop ? "Käivita (suur muutus lubatud)" : "Käivita sync"}
        tone={allowLargeDrop ? "danger" : "primary"}
        pending={pending}
        onCancel={() => setConfirming(false)}
        onConfirm={() =>
          startTransition(async () => {
            const result = await action(allowLargeDrop);
            setConfirming(false);
            if (result.ok) toast.success(result.message);
            else toast.error(result.error);
            setAllowLargeDrop(false);
          })
        }
      >
        <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
          <dt className="text-muted">Tarnija</dt>
          <dd className="font-medium">{name}</dd>
          <dt className="text-muted">Tegevus</dt>
          <dd>Loeb {source} → uuendab pakkumised, laoseisu ja hinnad andmebaasis → tühjendab poe vahemälu.</dd>
          <dt className="text-muted">Suur muutus</dt>
          <dd className={allowLargeDrop ? "font-semibold text-danger" : undefined}>
            {allowLargeDrop ? "LUBATUD — tarnija nimekirjast puuduvad pakkumised võetakse müügist maha ka siis, kui neid on palju." : safeguard}
          </dd>
        </dl>
        <p className="text-muted">Admini parandusi (`manual_overrides`) sync ei puuduta. Võib kesta kuni paar minutit.</p>
      </ConfirmDialog>
    </div>
  );
}

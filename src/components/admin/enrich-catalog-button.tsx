"use client";

import { Sparkles } from "lucide-react";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { enrichCatalogAction } from "@/server/admin/data-quality/actions";
import { ConfirmDialog } from "./confirm-dialog";
import { useToast } from "./toast";

/** Andmekvaliteet → "Rikasta kataloogi" (Laptopid.ee pildid + GPU/resolutsioon; idempotentne, admini parandusi ei puutu). */
export function EnrichCatalogButton() {
  const toast = useToast();
  const [confirming, setConfirming] = useState(false);
  const [pending, startTransition] = useTransition();
  return (
    <>
      <Button type="button" disabled={pending} onClick={() => setConfirming(true)}>
        <Sparkles className={pending ? "size-4 animate-pulse" : "size-4"} aria-hidden />
        {pending ? "Rikastan…" : "Rikasta kataloogi"}
      </Button>
      <ConfirmDialog
        open={confirming}
        title="Rikasta kataloogi?"
        confirmLabel="Käivita rikastus"
        pending={pending}
        onCancel={() => setConfirming(false)}
        onConfirm={() =>
          startTransition(async () => {
            const result = await enrichCatalogAction();
            setConfirming(false);
            if (result.ok) toast.success(result.message);
            else toast.error(result.error);
          })
        }
      >
        <p>Rikastus käib läbi kogu kataloogi ja võib muuta <strong>sadade mudelite ja pakkumiste</strong> rikastusandmeid:</p>
        <ul className="list-disc space-y-1 pl-5">
          <li>Laptopid.ee pildid mudelitele (ainult kindla vastega; ebakindel vaste → ülevaatus);</li>
          <li>integreeritud GPU, resolutsioon ja kiirusindeks täpse vastega (`enrichment` väljad).</li>
        </ul>
        <p>Admini parandusi (`manual_overrides`) ja peidetud pilte ei puudutata. Icecati pilte siin ei laeta. Poe vahemälu tühjendatakse. Võib kesta kuni paar minutit.</p>
      </ConfirmDialog>
    </>
  );
}

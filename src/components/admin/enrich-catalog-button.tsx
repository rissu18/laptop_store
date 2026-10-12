"use client";

import { Sparkles } from "lucide-react";
import { useTransition } from "react";
import { Button } from "@/components/ui/button";
import { enrichCatalogAction } from "@/server/admin/data-quality/actions";
import { useToast } from "./toast";

/** Andmekvaliteet → "Rikasta kataloogi" (Laptopid.ee pildid + GPU/resolutsioon; idempotentne, admini parandusi ei puutu). */
export function EnrichCatalogButton() {
  const toast = useToast();
  const [pending, startTransition] = useTransition();
  return (
    <Button
      type="button"
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          const result = await enrichCatalogAction();
          if (result.ok) toast.success(result.message);
          else toast.error(result.error);
        })
      }
    >
      <Sparkles className={pending ? "size-4 animate-pulse" : "size-4"} aria-hidden />
      {pending ? "Rikastan…" : "Rikasta kataloogi"}
    </Button>
  );
}

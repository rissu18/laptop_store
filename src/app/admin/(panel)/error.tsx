"use client";

import { ErrorState } from "@/components/admin/ui";
import { Button } from "@/components/ui/button";

/** Productionis ei näidata vea sisu ega stack trace'i — ainult viite-ID, mille järgi logist otsida. */
export default function AdminError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  return (
    <ErrorState
      description="Lehe laadimine ebaõnnestus. Proovi uuesti; kui viga kordub, vaata Süsteem → Logid."
      errorId={error.digest}
      action={
        <Button variant="outline" onClick={() => retry()}>
          Proovi uuesti
        </Button>
      }
    />
  );
}

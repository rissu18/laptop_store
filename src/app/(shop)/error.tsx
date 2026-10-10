"use client";

import { Container } from "@/components/ui/container";
import { Button } from "@/components/ui/button";

/** Poe veaolek (nt andmebaas ajutiselt kättesaamatu). Valeandmeid ei näidata; vea ID on serveri logis. */
export default function ShopError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  return (
    <Container className="py-20 text-center">
      <h1 className="text-2xl font-semibold">Lehte ei õnnestunud laadida</h1>
      <p className="mx-auto mt-2 max-w-md text-muted">Tegemist on ajutise tehnilise veaga. Palun proovi mõne hetke pärast uuesti.</p>
      {error.digest && <p className="mt-2 text-xs text-subtle">Vea ID: {error.digest}</p>}
      <Button className="mt-6" onClick={() => retry()}>
        Proovi uuesti
      </Button>
    </Container>
  );
}

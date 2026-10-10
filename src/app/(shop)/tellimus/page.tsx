import type { Metadata } from "next";
import { Button } from "@/components/ui/button";
import { Container } from "@/components/ui/container";

export const metadata: Metadata = { title: "Tellimuse otsing", robots: { index: false } };

/** Phase 5: tellimuse staatus tellimuse numbri + e-posti järgi (kliendikontot pole vaja). */
export default function OrderLookupPage() {
  return (
    <Container className="max-w-md py-12 pb-16">
      <h1 className="text-3xl font-bold tracking-tight">Tellimuse otsing</h1>
      <p className="mt-2 text-muted">Sisesta tellimuse number ja e-posti aadress, mida kasutasid tellimisel.</p>
      <form className="mt-8 space-y-4">
        <fieldset disabled className="space-y-4">
          <label className="block text-sm font-medium">
            Tellimuse number
            <input name="number" className="mt-1 h-11 w-full rounded-md border border-border-strong px-3" placeholder="nt SP-2026-000123" />
          </label>
          <label className="block text-sm font-medium">
            E-post
            <input name="email" type="email" autoComplete="email" className="mt-1 h-11 w-full rounded-md border border-border-strong px-3" />
          </label>
          <Button type="submit" fullWidth size="lg">
            Otsi tellimust
          </Button>
        </fieldset>
        <p className="text-center text-xs text-muted">Tellimuse otsing lisandub koos tellimuste vastuvõtmisega.</p>
      </form>
    </Container>
  );
}

import type { Metadata } from "next";
import { storeConfig } from "@/config/store";
import { UseCasePicker } from "@/components/home/use-case-picker";
import { Breadcrumbs } from "@/components/layout/breadcrumbs";
import { Container } from "@/components/ui/container";

export const metadata: Metadata = {
  title: "Leia sobiv sülearvuti",
  description: "Vali kasutusotstarve ja näitame sulle sobivaid kasutatud äriklassi sülearvuteid.",
};

/** Phase 8-s asendub 4-küsimuselise wizard'iga (deterministlik scoring, mitte AI). */
export default function FinderPage() {
  return (
    <Container className="pb-16">
      <Breadcrumbs items={[{ label: "Leia sobiv" }]} siteUrl={storeConfig.siteUrl} />
      <h1 className="text-3xl font-bold tracking-tight">Leia endale sobiv sülearvuti</h1>
      <p className="mb-8 mt-2 max-w-2xl text-muted">
        Vali, milleks sülearvutit peamiselt kasutad. Näitame sobivate filtritega valikut, mida saad edasi täpsustada.
      </p>
      <UseCasePicker />
    </Container>
  );
}

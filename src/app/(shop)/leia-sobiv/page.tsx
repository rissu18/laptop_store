import type { Metadata } from "next";
import { storeConfig } from "@/config/store";
import { LaptopFinder } from "@/components/finder/laptop-finder";
import { Breadcrumbs } from "@/components/layout/breadcrumbs";
import { Container } from "@/components/ui/container";

export const metadata: Metadata = {
  title: "Leia sobiv sülearvuti",
  description: "Vasta neljale küsimusele ja soovitame sulle sobivad kasutatud äriklassi sülearvutid.",
};

/** 4-sammuline leidja; soovitused tulevad deterministlikust hindamisest (src/domain/finder). */
export default function FinderPage() {
  return (
    <Container className="max-w-4xl pb-16">
      <Breadcrumbs items={[{ label: "Leia sobiv" }]} siteUrl={storeConfig.siteUrl} />
      <h1 className="text-3xl font-bold tracking-tight">Leia endale sobiv sülearvuti</h1>
      <p className="mb-8 mt-2 text-muted">Neli lühikest küsimust — soovitame kuni kolm sobivat sülearvutit koos põhjendusega.</p>
      <LaptopFinder />
    </Container>
  );
}

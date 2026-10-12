import type { Metadata } from "next";
import { Suspense } from "react";
import { storeConfig } from "@/config/store";
import { PURPOSE_PARAM, parsePurpose } from "@/domain/finder/finder";
import { LaptopFinder } from "@/components/finder/laptop-finder";
import { Breadcrumbs } from "@/components/layout/breadcrumbs";
import { Container } from "@/components/ui/container";

export const metadata: Metadata = {
  title: "Leia sobiv sülearvuti",
  description: "Vasta neljale küsimusele ja soovitame sulle sobivad kasutatud äriklassi sülearvutid.",
};

/** ?eesmark=work (avalehelt) → leidja alustab eelvalitud eesmärgiga; tundmatu väärtus jäetakse tähelepanuta. */
async function FinderWithPurpose({ searchParams }: Pick<PageProps<"/leia-sobiv">, "searchParams">) {
  const purpose = parsePurpose((await searchParams)[PURPOSE_PARAM]);
  return <LaptopFinder key={purpose ?? "start"} initialPurpose={purpose} />;
}

/** 4-sammuline leidja; soovitused tulevad deterministlikust hindamisest (src/domain/finder). */
export default function FinderPage({ searchParams }: PageProps<"/leia-sobiv">) {
  return (
    <Container className="max-w-4xl pb-16">
      <Breadcrumbs items={[{ label: "Leia sobiv" }]} siteUrl={storeConfig.siteUrl} />
      <h1 className="text-3xl font-bold tracking-tight">Leia endale sobiv sülearvuti</h1>
      <p className="mb-8 mt-2 text-muted">Neli lühikest küsimust — soovitame kuni kolm sobivat sülearvutit koos põhjendusega.</p>
      <Suspense fallback={<LaptopFinder />}>
        <FinderWithPurpose searchParams={searchParams} />
      </Suspense>
    </Container>
  );
}

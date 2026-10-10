import type { Metadata } from "next";
import { Suspense } from "react";
import { storeConfig } from "@/config/store";
import { hasFilters, parseCatalogQuery } from "@/domain/catalog/query";
import { Breadcrumbs } from "@/components/layout/breadcrumbs";
import { Container } from "@/components/ui/container";
import { CatalogListing, CatalogListingSkeleton } from "./catalog-listing";

export async function generateMetadata({ searchParams }: PageProps<"/sulearvutid">): Promise<Metadata> {
  const query = parseCatalogQuery(await searchParams);
  return {
    title: "Kasutatud sülearvutid",
    description: "Kõik kasutatud äriklassi sülearvutid: filtreeri tootja, hinna, seisukorra, protsessori, mälu ja ekraani järgi.",
    alternates: { canonical: "/sulearvutid" },
    // Filtritega URL-id ei lähe Google'i indeksisse (vältimaks tuhandeid duplikaatlehti)
    robots: hasFilters(query) ? { index: false, follow: true } : undefined,
  };
}

export default function LaptopsPage({ searchParams }: PageProps<"/sulearvutid">) {
  return (
    <Container className="pb-16">
      <Breadcrumbs items={[{ label: "Sülearvutid" }]} siteUrl={storeConfig.siteUrl} />
      <h1 className="text-3xl font-bold tracking-tight">Kasutatud sülearvutid</h1>
      <Suspense fallback={<CatalogListingSkeleton />}>
        <CatalogListing searchParams={searchParams} basePath="/sulearvutid" />
      </Suspense>
    </Container>
  );
}

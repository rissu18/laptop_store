import type { Metadata } from "next";
import { storeConfig } from "@/config/store";
import { Breadcrumbs } from "@/components/layout/breadcrumbs";
import { ProductGrid } from "@/components/product/product-card";
import { Container } from "@/components/ui/container";
import { getFeaturedItems } from "@/server/catalog/catalog-service";

export const metadata: Metadata = {
  title: "Parimad pakkumised",
  description: "Valitud kasutatud äriklassi sülearvutid hea hinna ja jõudluse suhtega.",
  alternates: { canonical: "/parimad-pakkumised" },
};

export default async function DealsPage() {
  // MVP: admin valib esiletõstetud tooted. Hiljem: algoritm (hind, ostuhind, CPU, RAM, SSD, seisukord, laoseis).
  const items = await getFeaturedItems(24);
  return (
    <Container className="pb-16">
      <Breadcrumbs items={[{ label: "Parimad pakkumised" }]} siteUrl={storeConfig.siteUrl} />
      <h1 className="text-3xl font-bold tracking-tight">Parimad pakkumised</h1>
      <p className="mb-8 mt-2 max-w-2xl text-muted">Meie valitud sülearvutid, mille hind ja jõudlus on heas tasakaalus.</p>
      <ProductGrid items={items} priorityCount={2} />
    </Container>
  );
}

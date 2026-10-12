import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { storeConfig } from "@/config/store";
import { hasFilters, parseCatalogQuery } from "@/domain/catalog/query";
import { BRAND_CODES, BRAND_NAMES, type BrandCode } from "@/domain/catalog/types";
import { Breadcrumbs } from "@/components/layout/breadcrumbs";
import { Container } from "@/components/ui/container";
import { CatalogListing, CatalogListingSkeleton } from "../catalog-listing";

const BRAND_INTROS: Record<BrandCode, string> = {
  lenovo: "ThinkPad on üks tuntumaid äriklassi sülearvutite seeriaid, mida tuntakse hea klaviatuuri ja vastupidavuse poolest.",
  dell: "Dell Latitude on äriklassi sülearvutite seeria igapäevaseks kontoritööks; Precision on mõeldud nõudlikumaks tööks.",
  hp: "HP EliteBook on HP äriklassi tippseeria, ProBook soodsam äriklassi valik ja ZBook mobiilne tööjaam.",
  fujitsu: "Fujitsu LifeBook on Fujitsu äriklassi sülearvutite seeria.",
  samsung: "Samsung Galaxy Book on Samsungi õhukeste sülearvutite seeria.",
  apple: "Apple MacBook Air ja MacBook Pro on macOS-iga sülearvutid.",
  microsoft: "Microsoft Surface Laptop on Microsofti õhukeste sülearvutite seeria.",
  panasonic: "Panasonic Toughbook on vastupidavate (rugged) sülearvutite seeria.",
  asus: "ASUS ExpertBook on ASUSe äriklassi sülearvutite seeria.",
  acer: "Acer Aspire on Aceri igapäevaste sülearvutite seeria.",
  getac: "Getac valmistab vastupidavaid (rugged) sülearvuteid.",
};

function isBrand(value: string): value is BrandCode {
  return (BRAND_CODES as readonly string[]).includes(value);
}

export function generateStaticParams() {
  return BRAND_CODES.map((brand) => ({ brand }));
}

export async function generateMetadata({ params, searchParams }: PageProps<"/sulearvutid/[brand]">): Promise<Metadata> {
  const { brand } = await params;
  if (!isBrand(brand)) return {};
  const query = parseCatalogQuery(await searchParams);
  return {
    title: `Kasutatud ${BRAND_NAMES[brand]} sülearvutid`,
    description: BRAND_INTROS[brand],
    alternates: { canonical: `/sulearvutid/${brand}` },
    robots: hasFilters(query, { brand: [brand] }) ? { index: false, follow: true } : undefined,
  };
}

async function BrandHeading({ params }: { params: PageProps<"/sulearvutid/[brand]">["params"] }) {
  const { brand } = await params;
  if (!isBrand(brand)) notFound();
  return (
    <>
      <Breadcrumbs items={[{ label: "Sülearvutid", href: "/sulearvutid" }, { label: BRAND_NAMES[brand] }]} siteUrl={storeConfig.siteUrl} />
      <h1 className="text-3xl font-bold tracking-tight">Kasutatud {BRAND_NAMES[brand]} sülearvutid</h1>
      <p className="mt-2 max-w-3xl text-muted">{BRAND_INTROS[brand]}</p>
    </>
  );
}

async function BrandListing({ params, searchParams }: PageProps<"/sulearvutid/[brand]">) {
  const { brand } = await params;
  if (!isBrand(brand)) return null;
  return <CatalogListing searchParams={searchParams} basePath={`/sulearvutid/${brand}`} locked={{ brand: [brand] }} />;
}

export default function BrandPage(props: PageProps<"/sulearvutid/[brand]">) {
  return (
    <Container className="pb-16">
      <Suspense fallback={<div className="h-28" />}>
        <BrandHeading params={props.params} />
      </Suspense>
      <Suspense fallback={<CatalogListingSkeleton />}>
        <BrandListing {...props} />
      </Suspense>
    </Container>
  );
}

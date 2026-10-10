import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { INFO_PAGES } from "@/config/info-pages";
import { storeConfig } from "@/config/store";
import { Breadcrumbs } from "@/components/layout/breadcrumbs";
import { Container } from "@/components/ui/container";

export function generateStaticParams() {
  return INFO_PAGES.map((page) => ({ slug: page.slug }));
}

export async function generateMetadata({ params }: PageProps<"/info/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  const page = INFO_PAGES.find((p) => p.slug === slug);
  return { title: page?.title ?? "Info" };
}

export default async function InfoPage({ params }: PageProps<"/info/[slug]">) {
  const { slug } = await params;
  const page = INFO_PAGES.find((p) => p.slug === slug);
  if (!page) notFound();

  return (
    <Container className="max-w-3xl pb-16">
      <Breadcrumbs items={[{ label: "Abi ja info", href: "/info" }, { label: page.title }]} siteUrl={storeConfig.siteUrl} />
      <h1 className="text-3xl font-bold tracking-tight">{page.title}</h1>
      {!page.confirmed && (
        <p className="mt-6 rounded-md bg-warning-soft p-4 text-sm text-warning">Arenduse märkus: selle lehe lõplik sisu on veel koostamisel.</p>
      )}
      <div className="mt-6 space-y-4 leading-relaxed">
        {page.paragraphs.map((paragraph) => (
          <p key={paragraph}>{paragraph}</p>
        ))}
      </div>
    </Container>
  );
}

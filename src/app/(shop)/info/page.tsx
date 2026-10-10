import type { Metadata } from "next";
import Link from "next/link";
import { INFO_PAGES } from "@/config/info-pages";
import { storeConfig } from "@/config/store";
import { Breadcrumbs } from "@/components/layout/breadcrumbs";
import { Container } from "@/components/ui/container";

export const metadata: Metadata = { title: "Abi ja info" };

export default function InfoIndexPage() {
  const links = [...INFO_PAGES.map((page) => ({ href: `/info/${page.slug}`, title: page.title })), { href: "/seisukorrad", title: "Seisukorra klassid" }];
  return (
    <Container className="max-w-3xl pb-16">
      <Breadcrumbs items={[{ label: "Abi ja info" }]} siteUrl={storeConfig.siteUrl} />
      <h1 className="text-3xl font-bold tracking-tight">Abi ja info</h1>
      <ul className="mt-8 grid gap-3 sm:grid-cols-2">
        {links.map((link) => (
          <li key={link.href}>
            <Link href={link.href} className="block rounded-lg border border-border p-4 font-semibold hover:border-primary hover:text-primary">
              {link.title}
            </Link>
          </li>
        ))}
      </ul>
    </Container>
  );
}

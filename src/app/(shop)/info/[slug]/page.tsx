import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Fragment, type ReactNode } from "react";
import { getInfoPage, INFO_PAGES, type InfoLink } from "@/config/info-pages";
import { storeConfig } from "@/config/store";
import { Breadcrumbs } from "@/components/layout/breadcrumbs";
import { Container } from "@/components/ui/container";
import { getSettings } from "@/server/settings/settings-service";

export function generateStaticParams() {
  return INFO_PAGES.map((page) => ({ slug: page.slug }));
}

export async function generateMetadata({ params }: PageProps<"/info/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  return { title: getInfoPage(slug)?.title ?? "Info" };
}

/**
 * Lõigu lingid (sisu on koodis, mitte kasutaja sisestatud): [tekst](/sisemine/tee), https://… aadressid ja e-postid.
 */
const LINK_PATTERN = /\[([^\]]+)\]\((\/[^)\s]*)\)|(https:\/\/[^\s,]+[^\s,.)])|([\w.+-]+@[\w-]+(?:\.[\w-]+)+)/g;

function RichText({ text }: { text: string }) {
  const nodes: ReactNode[] = [];
  let last = 0;
  for (const match of text.matchAll(LINK_PATTERN)) {
    const [whole, label, internalHref, url, email] = match;
    if (match.index > last) nodes.push(<Fragment key={`t${last}`}>{text.slice(last, match.index)}</Fragment>);
    const className = "break-words text-primary underline";
    nodes.push(
      internalHref ? (
        <Link key={match.index} href={internalHref} className={className}>
          {label}
        </Link>
      ) : (
        <a key={match.index} href={url ?? `mailto:${email}`} className={className}>
          {url ?? email}
        </a>
      ),
    );
    last = match.index + whole.length;
  }
  if (last < text.length) nodes.push(<Fragment key={`t${last}`}>{text.slice(last)}</Fragment>);
  return <>{nodes}</>;
}

function InfoLinkItem({ link }: { link: InfoLink }) {
  const className = "text-primary underline";
  return link.href.startsWith("/") ? (
    <Link href={link.href} className={className}>
      {link.label}
    </Link>
  ) : (
    <a href={link.href} className={className} {...(link.href.startsWith("https://") ? { target: "_blank", rel: "noopener noreferrer" } : {})}>
      {link.label}
    </a>
  );
}

export default async function InfoPage({ params }: PageProps<"/info/[slug]">) {
  const { slug } = await params;
  const page = getInfoPage(slug);
  if (!page) notFound();
  const { store } = await getSettings();

  return (
    <Container className="max-w-3xl pb-16">
      <Breadcrumbs items={[{ label: "Abi ja info", href: "/info" }, { label: page.title }]} siteUrl={storeConfig.siteUrl} />
      <h1 className="text-3xl font-bold tracking-tight">{page.title}</h1>
      {!page.confirmed && (
        <p className="mt-6 rounded-md bg-warning-soft p-4 text-sm text-warning">Arenduse märkus: selle lehe lõplik sisu on veel koostamisel.</p>
      )}
      {page.prototypeNote && store.prototypeMode && (
        <p role="note" className="mt-6 rounded-md bg-warning-soft p-4 text-sm text-warning">
          <strong className="font-semibold">Prototüüp:</strong> {page.prototypeNote}
        </p>
      )}
      <div className="mt-6 space-y-8 leading-relaxed">
        {page.sections.map((section, index) => (
          <section key={`${section.heading ?? ""}-${index}`} className="space-y-3">
            {section.heading && <h2 className="text-xl font-semibold tracking-tight">{section.heading}</h2>}
            {section.paragraphs?.map((paragraph) => (
              <p key={paragraph}>
                <RichText text={paragraph} />
              </p>
            ))}
            {section.links && section.links.length > 0 && (
              <ul className="space-y-1">
                {section.links.map((link) => (
                  <li key={link.href}>
                    <InfoLinkItem link={link} />
                  </li>
                ))}
              </ul>
            )}
          </section>
        ))}
      </div>
    </Container>
  );
}

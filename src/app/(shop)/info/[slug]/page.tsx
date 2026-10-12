import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Fragment, type ReactNode } from "react";
import { Clock, MapPin } from "lucide-react";
import Image from "next/image";
import { COMPANY, COMPANY_ADDRESS_LINE } from "@/config/company";
import { getInfoPage, INFO_PAGES, type InfoLink, type InfoPage as InfoPageData } from "@/config/info-pages";
import { storeConfig } from "@/config/store";
import { Breadcrumbs } from "@/components/layout/breadcrumbs";
import { SHOWROOM_PHOTOS } from "@/components/brand/showroom-photos";
import { ButtonLink } from "@/components/ui/button";
import { cx } from "@/components/ui/class-names";
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

/**
 * Salongi foto + sissejuhatus (Kontakt, Meist) — teeb lehest päris poe/salongi lehe, mitte ainult tekstitabeli.
 * Kontakt: lai foto (16:10) + kiirinfo; Meist: püstine detailfoto.
 */
function ShowroomIntro({ showroom }: { showroom: NonNullable<InfoPageData["showroom"]> }) {
  const photo = SHOWROOM_PHOTOS[showroom.photo];
  const portrait = photo.src.height > photo.src.width;
  return (
    <section
      aria-labelledby="salong-sissejuhatus"
      className={cx(
        "mt-6 grid overflow-hidden rounded-2xl border border-border bg-surface shadow-sm",
        portrait ? "md:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]" : "md:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]",
      )}
    >
      <div className={cx("relative", portrait ? "aspect-[4/3] md:aspect-auto md:min-h-[380px]" : "aspect-[16/10] md:aspect-auto md:min-h-[340px]")}>
        <Image
          src={photo.src}
          alt={photo.alt}
          fill
          preload
          placeholder="blur"
          sizes={portrait ? "(min-width: 1024px) 400px, (min-width: 768px) 40vw, 100vw" : "(min-width: 1024px) 600px, (min-width: 768px) 60vw, 100vw"}
          className={cx("object-cover", portrait && "object-[50%_40%]")}
        />
      </div>
      <div className="flex flex-col justify-center gap-4 p-6 sm:p-8">
        <h2 id="salong-sissejuhatus" className="text-xl font-bold tracking-tight sm:text-2xl">
          {showroom.heading}
        </h2>
        <p className="leading-relaxed text-body">{showroom.lead}</p>
        <ul className="space-y-2 text-sm">
          <li className="flex gap-2">
            <MapPin className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
            <span>
              <span className="font-semibold">{COMPANY_ADDRESS_LINE}</span>
              <span className="block text-muted">{COMPANY.entrance}</span>
            </span>
          </li>
          <li className="flex gap-2">
            <Clock className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
            <span className="font-semibold">{COMPANY.openingHours[0]}</span>
          </li>
        </ul>
        <div className="flex flex-wrap gap-3">
          <ButtonLink href={COMPANY.mapsUrl} target="_blank" rel="noopener noreferrer">
            Ava kaardil
          </ButtonLink>
          {showroom.photo === "contact" ? (
            <ButtonLink href={COMPANY.phone.href} variant="outline">
              Helista {COMPANY.phone.label}
            </ButtonLink>
          ) : (
            <ButtonLink href="/info/kontakt" variant="outline">
              Salong ja kontakt
            </ButtonLink>
          )}
        </div>
      </div>
    </section>
  );
}

export default async function InfoPage({ params }: PageProps<"/info/[slug]">) {
  const { slug } = await params;
  const page = getInfoPage(slug);
  if (!page) notFound();
  const { store } = await getSettings();

  return (
    <Container className={cx("pb-16", page.showroom ? "max-w-5xl" : "max-w-3xl")}>
      <Breadcrumbs items={[{ label: "Abi ja info", href: "/info" }, { label: page.title }]} siteUrl={storeConfig.siteUrl} />
      <h1 className="text-3xl font-bold tracking-tight">{page.title}</h1>
      {page.showroom && <ShowroomIntro showroom={page.showroom} />}
      {!page.confirmed && (
        <p className="mt-6 rounded-md bg-warning-soft p-4 text-sm text-warning">Arenduse märkus: selle lehe lõplik sisu on veel koostamisel.</p>
      )}
      {page.prototypeNote && store.prototypeMode && (
        <p role="note" className="mt-6 rounded-md bg-warning-soft p-4 text-sm text-warning">
          <strong className="font-semibold">Prototüüp:</strong> {page.prototypeNote}
        </p>
      )}
      <div className={cx("leading-relaxed", page.showroom ? "mt-10 grid gap-x-10 gap-y-8 md:grid-cols-2" : "mt-6 space-y-8")}>
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

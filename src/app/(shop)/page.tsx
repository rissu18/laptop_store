import { Mail, MapPin, Phone } from "lucide-react";
import Link from "next/link";
import { COMPANY } from "@/config/company";
import { SHOWROOM } from "@/domain/storefront/showroom";
import { getSettings, visibleTrustItems } from "@/server/settings/settings-service";
import { BusinessSeries } from "@/components/home/business-series";
import { FinderEntry } from "@/components/home/finder-entry";
import { Hero } from "@/components/home/hero";
import { SectionHeader } from "@/components/home/section-header";
import { ShowroomSection } from "@/components/home/showroom-section";
import { ValueProps } from "@/components/home/value-props";
import { ProductGrid } from "@/components/product/product-card";
import { Container } from "@/components/ui/container";
import { getBusinessSeries, getCatalogStats, getFeaturedItems, getRecentlyAddedItems } from "@/server/catalog/catalog-service";

/**
 * Avaleht — sülearvutispetsialist + päris salong:
 * hero (salongifoto) → usaldusriba → "Milleks vajad?" (leidja) → parimad pakkumised →
 * äriklassi seeriad → salong → viimati lisatud → kontakt.
 */
export default async function HomePage() {
  const [stats, featured, recent, businessSeries, settings] = await Promise.all([
    getCatalogStats(),
    getFeaturedItems(8),
    getRecentlyAddedItems(4),
    getBusinessSeries(),
    getSettings(),
  ]);

  return (
    <>
      <Hero />
      <ValueProps stats={stats} trustItems={visibleTrustItems(settings)} />
      <FinderEntry />

      {featured.length > 0 && (
        <Container className="py-10">
          <section aria-labelledby="parimad-pakkumised">
            <SectionHeader
              id="parimad-pakkumised"
              title="Parimad pakkumised"
              description="Hoolikalt valitud sülearvutid hea hinna ja jõudluse suhtega."
              link={{ href: "/parimad-pakkumised", label: "Kõik pakkumised" }}
            />
            {/* Mobiilis 4, suuremal ekraanil 8 */}
            <ProductGrid items={featured.slice(0, 4)} className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4" />
            {featured.length > 4 && (
              <ProductGrid items={featured.slice(4)} className="mt-4 hidden gap-4 sm:grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4" />
            )}
          </section>
        </Container>
      )}

      {businessSeries.length > 0 && (
        <Container className="py-10">
          <section aria-labelledby="seeriad">
            <SectionHeader
              id="seeriad"
              title="Populaarsed äriklassi seeriad"
              description="ThinkPad, Latitude, EliteBook ja teised — vali seeria, mida tead ja usaldad."
              link={{ href: "/sulearvutid", label: "Kõik sülearvutid" }}
            />
            <BusinessSeries groups={businessSeries} />
          </section>
        </Container>
      )}

      <ShowroomSection immediateCount={stats.immediateCount} />

      {recent.length > 0 && (
        <Container className="py-10">
          <section aria-labelledby="viimati-lisatud">
            <SectionHeader
              id="viimati-lisatud"
              title="Viimati lisatud"
              description="Värskelt valikusse jõudnud äriklassi sülearvutid — seisukord vähemalt B."
              link={{ href: "/sulearvutid?sort=recently-added", label: "Kõik uued" }}
            />
            <ProductGrid items={recent} />
          </section>
        </Container>
      )}

      <Container className="pb-14 pt-4">
        <section aria-labelledby="kontakt-teaser" className="flex flex-col gap-5 rounded-2xl bg-topbar px-6 py-7 text-white sm:px-10 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h2 id="kontakt-teaser" className="text-xl font-bold tracking-tight sm:text-2xl">
              Küsimusi? Aitame valida.
            </h2>
            <p className="mt-1 text-sm text-white/75">Helista, kirjuta või tule salongi — {SHOWROOM.addressShort}, {SHOWROOM.hours}.</p>
          </div>
          <ul className="flex flex-col gap-2 text-sm sm:flex-row sm:flex-wrap sm:gap-x-6">
            <li>
              <a href={COMPANY.phone.href} className="inline-flex min-h-11 items-center gap-2 font-semibold hover:underline">
                <Phone className="size-4" aria-hidden />
                {COMPANY.phone.label}
              </a>
            </li>
            <li>
              <a href={`mailto:${COMPANY.email}`} className="inline-flex min-h-11 items-center gap-2 font-semibold hover:underline">
                <Mail className="size-4" aria-hidden />
                {COMPANY.email}
              </a>
            </li>
            <li>
              <Link href={SHOWROOM.contactHref} className="inline-flex min-h-11 items-center gap-2 font-semibold hover:underline">
                <MapPin className="size-4" aria-hidden />
                Salong ja kontakt
              </Link>
            </li>
          </ul>
        </section>
      </Container>
    </>
  );
}

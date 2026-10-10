import { storeConfig } from "@/config/store";
import { getSettings, visibleTrustItems } from "@/server/settings/settings-service";
import { BrandTiles } from "@/components/home/brand-tiles";
import { Hero } from "@/components/home/hero";
import { SectionHeader } from "@/components/home/section-header";
import { UseCasePicker } from "@/components/home/use-case-picker";
import { ValueProps } from "@/components/home/value-props";
import { WhyUsedSection } from "@/components/home/why-used-section";
import { ProductGrid } from "@/components/product/product-card";
import { Container } from "@/components/ui/container";
import {
  getCatalogStats,
  getFeaturedItems,
  getPopularModels,
  getRecentlyAddedItems,
  getSeriesSummaries,
} from "@/server/catalog/catalog-service";

export default async function HomePage() {
  const [stats, popular, featured, recent, series, settings] = await Promise.all([
    getCatalogStats(),
    getPopularModels(4),
    getFeaturedItems(8),
    getRecentlyAddedItems(4),
    getSeriesSummaries(),
    getSettings(),
  ]);

  return (
    <>
      <Hero stats={stats} popular={popular} autoSyncActive={storeConfig.autoSyncActive} />
      <ValueProps items={visibleTrustItems(settings)} />

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
            <ProductGrid items={featured.slice(0, 4)} priorityCount={1} className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4" />
            {featured.length > 4 && (
              <ProductGrid items={featured.slice(4)} className="mt-4 hidden gap-4 sm:grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4" />
            )}
          </section>
        </Container>
      )}

      <Container className="py-10">
        <section aria-labelledby="leia-sobiv">
          <SectionHeader
            id="leia-sobiv"
            title="Leia endale sobiv sülearvuti"
            description="Vali, milleks arvutit kasutad — näitame sobivaid mudeleid."
          />
          <UseCasePicker />
        </section>
      </Container>

      {recent.length > 0 && (
        <Container className="py-10">
          <section aria-labelledby="varskelt-laost">
            <SectionHeader
              id="varskelt-laost"
              title="Värskelt hulgilaost"
              description="Viimati meie valikusse lisandunud sülearvutid."
              link={{ href: "/sulearvutid?sort=recently-added", label: "Kõik uued" }}
            />
            <ProductGrid items={recent} />
          </section>
        </Container>
      )}

      {series.length > 0 && (
        <Container className="py-10">
          <section aria-labelledby="brandid">
            <SectionHeader id="brandid" title="Brändid ja seeriad" />
            <BrandTiles series={series} />
          </section>
        </Container>
      )}

      <WhyUsedSection />
    </>
  );
}

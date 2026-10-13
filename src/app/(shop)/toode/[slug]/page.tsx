import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { storeConfig } from "@/config/store";
import { arePaymentsLive, getSettings, visibleTrustItems } from "@/server/settings/settings-service";
import { defaultConfiguration } from "@/domain/catalog/configuration-order";
import { CONFIGURATION_PARAM, productHref, productPath } from "@/domain/catalog/urls";
import { BRAND_NAMES, type CatalogItem } from "@/domain/catalog/types";
import { imagesForDisplay } from "@/domain/images/product-image";
import { Breadcrumbs } from "@/components/layout/breadcrumbs";
import { ModelFitPanel, ProductHeading, PurchasePanel, StickyBuyBar } from "@/components/product/buy-box";
import { ProductGallery } from "@/components/product/product-gallery";
import { ProductGrid } from "@/components/product/product-card";
import { QuickSpecs } from "@/components/product/quick-specs";
import { VariantPicker } from "@/components/product/variant-picker";
import { SpecSections } from "@/components/product/spec-sections";
import { JsonLd } from "@/components/seo/json-ld";
import { Container } from "@/components/ui/container";
import { getAllProductSlugs, getProductPage, getSimilarItems } from "@/server/catalog/catalog-service";

export async function generateStaticParams() {
  return (await getAllProductSlugs()).map((slug) => ({ slug }));
}

export async function generateMetadata({ params }: PageProps<"/toode/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  const data = await getProductPage(slug);
  if (!data) return { title: "Toodet ei leitud" };
  // Esimene konfiguratsioon ei pruugi olla odavaim (poes kohapeal variandid on ees)
  const fromCents = Math.min(...data.variants.map((v) => v.price.saleCents));
  return {
    title: `${data.product.title} – kasutatud`,
    description: `Kasutatud ${data.product.title}: ${data.variants.length} konfiguratsiooni, hinnad alates ${(fromCents / 100).toFixed(0)} €. Vaata seisukorda, tehnilisi andmeid ja tarneaega.`,
    // Canonical on alati mudelileht ilma konfiguratsiooni parameetrita
    alternates: { canonical: productPath(slug) },
  };
}

function productJsonLd({ product }: CatalogItem, variants: CatalogItem["variant"][]) {
  // Mudeli pildid; kui neid pole, esimese konfiguratsiooni (tarnija) pildid
  const images = product.images.length > 0 ? product.images : (variants.find((v) => v.images.length > 0)?.images ?? []);
  return {
    "@context": "https://schema.org",
    "@type": "Product",
    name: product.title,
    brand: { "@type": "Brand", name: BRAND_NAMES[product.brand] },
    ...(images.length > 0 && {
      image: images.slice(0, 5).map((image) => new URL(image.largeUrl, storeConfig.siteUrl).toString()),
    }),
    url: new URL(productPath(product.slug), storeConfig.siteUrl).toString(),
    offers: variants.map((variant) => ({
      "@type": "Offer",
      sku: variant.sku,
      price: (variant.price.saleCents / 100).toFixed(2),
      priceCurrency: "EUR",
      itemCondition: "https://schema.org/UsedCondition",
      availability: variant.stock.available ? "https://schema.org/InStock" : "https://schema.org/OutOfStock",
      url: new URL(productHref({ product, variant }), storeConfig.siteUrl).toString(),
    })),
  };
}

async function ProductDetail({ params, searchParams }: PageProps<"/toode/[slug]">) {
  const [{ slug }, search] = await Promise.all([params, searchParams]);
  const data = await getProductPage(slug);
  if (!data) notFound();

  const requested = search[CONFIGURATION_PARAM];
  // Vaikimisi odavaim "Poes kohapeal" variant, selle puudumisel odavaim saadaval variant (configuration-order.ts)
  const variant = data.variants.find((v) => v.id === requested) ?? defaultConfiguration(data.variants)!;
  const item: CatalogItem = { product: data.product, variant };
  const settings = await getSettings();
  // "Turvaline maksmine" ainult siis, kui päris maksed on avatud (mitte prototüübis)
  const showSecurePayment = arePaymentsLive(settings) && visibleTrustItems(settings).some((t) => t.key === "payment");

  return (
    <>
      <Breadcrumbs
        siteUrl={storeConfig.siteUrl}
        items={[
          { label: "Sülearvutid", href: "/sulearvutid" },
          { label: BRAND_NAMES[data.product.brand], href: `/sulearvutid/${data.product.brand}` },
          { label: data.product.title },
        ]}
      />

      {/*
        Desktop: INFO VASAKUL (45%), GALERII PAREMAL (55%, kleepuv). Mobiil (DOM-i järjekord):
        pealkiri + seisukord → galerii → hind/saadavus/tarne/ost → konfiguratsioonid → põhiandmed → miks see mudel.
        Desktopis paigutatakse samad plokid gridi ridadesse (lg:row-start-*), galerii katab kõik read.
      */}
      <div className="grid grid-cols-[minmax(0,1fr)] gap-6 lg:grid-cols-[minmax(0,45fr)_minmax(0,55fr)] lg:grid-rows-[auto_auto_auto_auto_1fr] lg:gap-x-12">
        <div className="lg:col-start-1 lg:row-start-1">
          <ProductHeading item={item} />
        </div>
        <div className="min-w-0 lg:sticky lg:top-[124px] lg:col-start-2 lg:row-span-5 lg:row-start-1 lg:self-start">
          <ProductGallery
            key={variant.images.length > 0 ? variant.id : data.product.slug}
            images={imagesForDisplay(item)}
            title={data.product.title}
            screenSizeIn={data.product.screenSizeIn}
          />
        </div>
        <div className="lg:col-start-1 lg:row-start-4">
          <PurchasePanel item={item} showSecurePayment={showSecurePayment} />
        </div>
        {data.variants.length > 1 && (
          <div className="lg:col-start-1 lg:row-start-3">
            <VariantPicker product={data.product} variants={data.variants} selectedId={variant.id} />
          </div>
        )}
        <div className="lg:col-start-1 lg:row-start-2">
          <QuickSpecs item={item} />
        </div>
        <div className="empty:hidden lg:col-start-1 lg:row-start-5">
          <ModelFitPanel item={item} />
        </div>
      </div>

      <section aria-labelledby="tehnilised-andmed" className="mt-16">
        {/* Varasem väike kokkuvõte (CPU · RAM · SSD) eemaldati: sama info on kiirinfo kastides ja "Jõudluse" ridadena */}
        <h2 id="tehnilised-andmed" className="mb-6 text-2xl font-bold tracking-tight">
          Tehnilised andmed
        </h2>
        <SpecSections item={item} />
      </section>

      {/* Sarnased tooted on lehe lõpus: eraldi päring, mis ei blokeeri toote enda kuvamist (voogedastus) */}
      <Suspense fallback={null}>
        <SimilarProducts item={item} />
      </Suspense>

      <StickyBuyBar item={item} />
      <JsonLd data={productJsonLd(item, data.variants)} />
    </>
  );
}

async function SimilarProducts({ item }: { item: CatalogItem }) {
  const related = await getSimilarItems(item, 4);
  if (related.length === 0) return null;
  return (
    <section aria-labelledby="sarnased" className="mt-16">
      <h2 id="sarnased" className="mb-6 text-2xl font-bold tracking-tight">
        Sarnased sülearvutid
      </h2>
      <ProductGrid items={related} />
    </section>
  );
}

function ProductSkeleton() {
  return (
    <div className="grid gap-8 pt-14 lg:grid-cols-[45fr_55fr] lg:gap-12" aria-hidden>
      <div className="aspect-[4/3] animate-pulse rounded-lg bg-surface-sunken lg:order-2" />
      <div className="space-y-4">
        <div className="h-8 w-3/4 animate-pulse rounded bg-surface-sunken" />
        <div className="h-40 animate-pulse rounded bg-surface-sunken" />
        <div className="h-48 animate-pulse rounded bg-surface-sunken" />
      </div>
    </div>
  );
}

export default function ProductPage(props: PageProps<"/toode/[slug]">) {
  return (
    <Container className="pb-16">
      <Suspense fallback={<ProductSkeleton />}>
        <ProductDetail {...props} />
      </Suspense>
    </Container>
  );
}

import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { getVisibleTrustItems, storeConfig } from "@/config/store";
import { formatSpecLine } from "@/domain/catalog/format";
import { CONFIGURATION_PARAM, productHref, productPath } from "@/domain/catalog/urls";
import { BRAND_NAMES, type CatalogItem } from "@/domain/catalog/types";
import { imagesForDisplay } from "@/domain/images/product-image";
import { Breadcrumbs } from "@/components/layout/breadcrumbs";
import { BuyBox, StickyBuyBar } from "@/components/product/buy-box";
import { ProductGallery } from "@/components/product/product-gallery";
import { ProductGrid } from "@/components/product/product-card";
import { SpecSections } from "@/components/product/spec-sections";
import { JsonLd } from "@/components/seo/json-ld";
import { Container } from "@/components/ui/container";
import { getAllProductSlugs, getProductPage, getRelatedItems } from "@/server/catalog/catalog-service";

export async function generateStaticParams() {
  return (await getAllProductSlugs()).map((slug) => ({ slug }));
}

export async function generateMetadata({ params }: PageProps<"/toode/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  const data = await getProductPage(slug);
  if (!data) return { title: "Toodet ei leitud" };
  const cheapest = data.variants[0];
  return {
    title: `${data.product.title} – kasutatud`,
    description: `Kasutatud ${data.product.title}: ${data.variants.length} konfiguratsiooni, hinnad alates ${(cheapest.price.saleCents / 100).toFixed(0)} €. Vaata seisukorda, tehnilisi andmeid ja tarneaega.`,
    // Canonical on alati mudelileht ilma konfiguratsiooni parameetrita
    alternates: { canonical: productPath(slug) },
  };
}

function productJsonLd({ product }: CatalogItem, variants: CatalogItem["variant"][]) {
  return {
    "@context": "https://schema.org",
    "@type": "Product",
    name: product.title,
    brand: { "@type": "Brand", name: BRAND_NAMES[product.brand] },
    ...(product.images.length > 0 && {
      image: product.images.slice(0, 5).map((image) => new URL(image.largeUrl, storeConfig.siteUrl).toString()),
    }),
    url: new URL(productPath(product.slug), storeConfig.siteUrl).toString(),
    offers: variants.map((variant) => ({
      "@type": "Offer",
      sku: variant.sku,
      price: (variant.price.saleCents / 100).toFixed(2),
      priceCurrency: "EUR",
      itemCondition: "https://schema.org/UsedCondition",
      availability: variant.stock.quantity > 0 ? "https://schema.org/InStock" : "https://schema.org/OutOfStock",
      url: new URL(productHref({ product, variant }), storeConfig.siteUrl).toString(),
    })),
  };
}

async function ProductDetail({ params, searchParams }: PageProps<"/toode/[slug]">) {
  const [{ slug }, search] = await Promise.all([params, searchParams]);
  const data = await getProductPage(slug);
  if (!data) notFound();

  const requested = search[CONFIGURATION_PARAM];
  const variant =
    data.variants.find((v) => v.id === requested) ?? data.variants.find((v) => v.stock.quantity > 0) ?? data.variants[0];
  const item: CatalogItem = { product: data.product, variant };
  const related = await getRelatedItems(data.product, 4);
  const showSecurePayment = getVisibleTrustItems().some((t) => t.key === "payment");

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

      <div className="grid grid-cols-[minmax(0,1fr)] gap-8 lg:grid-cols-[minmax(0,55fr)_minmax(0,45fr)] lg:gap-12">
        <div className="min-w-0 lg:sticky lg:top-[124px] lg:self-start">
          <ProductGallery
            key={variant.images.length > 0 ? variant.id : data.product.slug}
            images={imagesForDisplay(item)}
            title={data.product.title}
            screenSizeIn={data.product.screenSizeIn}
          />
        </div>
        <BuyBox item={item} variants={data.variants} showSecurePayment={showSecurePayment} />
      </div>

      <section aria-labelledby="tehnilised-andmed" className="mt-16">
        <h2 id="tehnilised-andmed" className="text-2xl font-bold tracking-tight">
          Tehnilised andmed
        </h2>
        <p className="mb-6 mt-1 text-sm text-muted">{formatSpecLine(item)}</p>
        <SpecSections item={item} />
      </section>

      {related.length > 0 && (
        <section aria-labelledby="sarnased" className="mt-16">
          <h2 id="sarnased" className="mb-6 text-2xl font-bold tracking-tight">
            Sarnased sülearvutid
          </h2>
          <ProductGrid items={related} />
        </section>
      )}

      <StickyBuyBar item={item} />
      <JsonLd data={productJsonLd(item, data.variants)} />
    </>
  );
}

function ProductSkeleton() {
  return (
    <div className="grid gap-8 pt-14 lg:grid-cols-[55fr_45fr] lg:gap-12" aria-hidden>
      <div className="aspect-[4/3] animate-pulse rounded-lg bg-surface-sunken" />
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

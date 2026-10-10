import { storeConfig } from "@/config/store";
import { CompareBar } from "@/components/compare/compare-bar";
import { PrototypeNotice } from "@/components/layout/prototype-notice";
import { SiteFooter } from "@/components/layout/site-footer";
import { SiteHeader } from "@/components/layout/site-header";
import { JsonLd } from "@/components/seo/json-ld";
import { getSettings, visibleTrustItems } from "@/server/settings/settings-service";

/** Poe tavalehtede layout. Checkout saab Phase 5-s oma minimaalse layout'i (ilma põhimenüüta). */
export default async function ShopLayout({ children }: LayoutProps<"/">) {
  const settings = await getSettings();
  const { general } = settings;
  return (
    <>
      <a
        href="#sisu"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-md focus:bg-surface focus:px-4 focus:py-2 focus:shadow-lg"
      >
        Liigu sisu juurde
      </a>
      {settings.store.prototypeMode && <PrototypeNotice />}
      <SiteHeader storeName={general.storeName} trustItems={visibleTrustItems(settings)} />
      <main id="sisu" className="flex-1">
        {children}
      </main>
      <SiteFooter storeName={general.storeName} legalName={general.companyName} registryCode={general.registryCode} />
      <CompareBar />
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "Organization",
          name: general.storeName,
          url: storeConfig.siteUrl,
        }}
      />
    </>
  );
}

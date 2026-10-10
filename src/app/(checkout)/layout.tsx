import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { Logo } from "@/components/layout/logo";
import { PrototypeNotice } from "@/components/layout/prototype-notice";
import { Container } from "@/components/ui/container";
import { getSettings } from "@/server/settings/settings-service";

/**
 * Kassa paigutus: ilma põhimenüü ja otsinguta (vähem segajaid), aga logo ja tee tagasi ostukorvi on alles.
 */
export default async function CheckoutLayout({ children }: { children: React.ReactNode }) {
  const settings = await getSettings();
  return (
    <>
      {settings.store.prototypeMode && <PrototypeNotice />}
      <header className="border-b border-border bg-surface">
        <Container>
          <div className="flex h-16 items-center justify-between gap-4">
            <Logo name={settings.general.storeName} />
            <Link href="/ostukorv" className="inline-flex min-h-10 items-center gap-1.5 rounded-md px-2 text-sm font-medium text-muted hover:text-text">
              <ArrowLeft className="size-4" aria-hidden /> Tagasi ostukorvi
            </Link>
          </div>
        </Container>
      </header>
      <main id="sisu" className="flex-1 bg-surface-alt">
        {children}
      </main>
    </>
  );
}

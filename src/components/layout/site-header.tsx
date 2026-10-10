import { BadgeCheck, CreditCard, RotateCcw, ShieldCheck, Truck } from "lucide-react";
import type { TrustItem } from "@/config/store";
import { SearchBox } from "@/components/search/search-box";
import { Container } from "@/components/ui/container";
import { HeaderActions } from "./header-actions";
import { Logo } from "./logo";
import { MainNav } from "./main-nav";
import { MobileMenu } from "./mobile-menu";

export const TRUST_ICONS: Record<TrustItem["key"], typeof ShieldCheck> = {
  warranty: ShieldCheck,
  returns: RotateCcw,
  delivery: Truck,
  payment: CreditCard,
  inspected: BadgeCheck,
};

/** Väike usaldusriba headeri kohal (ainult desktopil). Väärtused tulevad seadistusest. */
function TrustBar({ items }: { items: TrustItem[] }) {
  if (items.length === 0) return null;
  return (
    <div className="hidden bg-surface-alt text-xs text-muted md:block">
      <Container>
        <ul className="flex h-9 items-center justify-center gap-8">
          {items.map((item) => {
            const Icon = TRUST_ICONS[item.key];
            return (
              <li key={item.key} className="flex items-center gap-1.5">
                <Icon className="size-3.5 text-primary" aria-hidden />
                {item.title}
              </li>
            );
          })}
        </ul>
      </Container>
    </div>
  );
}

export function SiteHeader({ storeName, trustItems }: { storeName: string; trustItems: TrustItem[] }) {
  return (
    <>
      <TrustBar items={trustItems} />
      {/* Mobiilis header ei kleepu (säästab ekraaniruumi) — seal kleepub nimekirja filtririba */}
      <header className="relative z-40 border-b md:sticky md:top-0 border-border bg-surface/95 backdrop-blur supports-[backdrop-filter]:bg-surface/85">
        <Container>
          <div className="flex h-16 items-center gap-3 lg:gap-8">
            <MobileMenu />
            <Logo name={storeName} />
            <div className="hidden flex-1 justify-center md:flex">
              <SearchBox className="max-w-2xl" />
            </div>
            <div className="ml-auto md:ml-0">
              <HeaderActions />
            </div>
          </div>
          {/* Mobiilis on otsing alati nähtav eraldi real */}
          <div className="pb-3 md:hidden">
            <SearchBox />
          </div>
          <MainNav />
        </Container>
      </header>
    </>
  );
}

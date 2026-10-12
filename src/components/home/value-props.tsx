import { Layers, Store, type LucideIcon } from "lucide-react";
import type { TrustItem } from "@/config/store";
import { formatEur } from "@/domain/money/money";
import { roundedCountLabel, SHOWROOM } from "@/domain/storefront/showroom";
import { Container } from "@/components/ui/container";
import { TRUST_ICONS } from "@/components/layout/site-header";

interface Highlight {
  key: string;
  icon: LucideIcon;
  title: string;
  detail: string;
}

/**
 * Kompaktne usaldusriba hero all. Ainult tõestatavad väited:
 *  - salongi arv ja valiku suurus tulevad kataloogist (ümardatud allapoole, `roundedCountLabel`);
 *  - taganemisõigus ja tarne tulevad admini usaldusriba seadetest (sama tekst mis headeris).
 * Garantii pikkust siin ei väideta — see on iga toote juures eraldi (tarnija andmetest).
 */
export function ValueProps({
  stats,
  trustItems,
}: {
  stats: { count: number; minPriceCents: number | null; immediateCount: number };
  trustItems: TrustItem[];
}) {
  const immediate = roundedCountLabel(stats.immediateCount);
  const highlights: Highlight[] = [
    immediate !== null && {
      key: "showroom",
      icon: Store,
      title: `${immediate} sülearvutit kohapeal`,
      detail: `Salongis ${SHOWROOM.addressShort}`,
    },
    stats.count > 0 && {
      key: "selection",
      icon: Layers,
      title: `${stats.count} konfiguratsiooni valikus`,
      detail: stats.minPriceCents !== null ? `Hinnad alates ${formatEur(stats.minPriceCents)}` : "Lenovo, Dell, HP ja teised",
    },
    ...trustItems
      .filter((item) => item.key === "returns" || item.key === "delivery")
      .map((item) => ({ key: item.key, icon: TRUST_ICONS[item.key], title: item.title, detail: item.detail })),
  ].filter((item): item is Highlight => Boolean(item));

  if (highlights.length === 0) return null;
  return (
    <Container className="relative z-10 -mt-px pb-2 pt-6 lg:-mt-6 lg:pt-0">
      <ul className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-border bg-border shadow-sm lg:grid-cols-4">
        {highlights.map(({ key, icon: Icon, title, detail }) => (
          <li key={key} className="flex flex-col gap-2 bg-surface p-3.5 sm:flex-row sm:items-center sm:gap-3 sm:px-4">
            <span className="flex size-9 shrink-0 sm:size-10 items-center justify-center rounded-lg bg-primary-soft text-primary">
              <Icon className="size-5" aria-hidden />
            </span>
            <div className="min-w-0">
              <p className="text-sm font-semibold">{title}</p>
              <p className="text-sm text-muted">{detail}</p>
            </div>
          </li>
        ))}
      </ul>
    </Container>
  );
}

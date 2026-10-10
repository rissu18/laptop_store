import type { TrustItem } from "@/config/store";
import { Container } from "@/components/ui/container";
import { TRUST_ICONS } from "@/components/layout/site-header";

/** Neli väärtuspakkumist hero all. Ainult seadistusest tulevad (tõestatavad) väited. */
export function ValueProps({ items }: { items: TrustItem[] }) {
  if (items.length === 0) return null;
  return (
    <Container className="py-8">
      <ul className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {items.map((item) => {
          const Icon = TRUST_ICONS[item.key];
          return (
            <li key={item.key} className="flex items-start gap-3 rounded-lg p-2">
              <span className="flex size-10 shrink-0 items-center justify-center rounded-md bg-primary-soft text-primary">
                <Icon className="size-5" aria-hidden />
              </span>
              <div>
                <p className="text-sm font-semibold">{item.title}</p>
                <p className="text-sm text-muted">{item.detail}</p>
              </div>
            </li>
          );
        })}
      </ul>
    </Container>
  );
}

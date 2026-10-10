import { Cpu, HardDrive, Keyboard, MemoryStick, Monitor, MonitorSmartphone } from "lucide-react";
import { formatScreenSize, formatStorage } from "@/domain/catalog/format";
import type { CatalogItem } from "@/domain/catalog/types";

/** 6 olulisemat väärtust visuaalselt — kasutaja saab 3 sekundiga aru, mis masinaga on tegu. */
export function QuickSpecs({ item }: { item: CatalogItem }) {
  const { product, variant } = item;
  const specs = [
    { icon: Cpu, label: "Protsessor", value: variant.cpu.model.replace(/^(Intel|AMD)\s+/, "") },
    { icon: MemoryStick, label: "Mälu", value: `${variant.ramGb} GB RAM` },
    { icon: HardDrive, label: "Salvestus", value: `${formatStorage(variant.storageGb)} SSD` },
    {
      icon: Monitor,
      label: "Ekraan",
      value: [formatScreenSize(product.screenSizeIn), variant.display.resolutionLabel].filter(Boolean).join(" "),
    },
    { icon: MonitorSmartphone, label: "Graafika", value: variant.gpu.model },
    variant.keyboardLayout && { icon: Keyboard, label: "Klaviatuur", value: variant.keyboardLayout },
  ].filter((spec): spec is NonNullable<typeof spec> => Boolean(spec));

  return (
    <dl className="grid grid-cols-2 gap-2 sm:grid-cols-3">
      {specs.map(({ icon: Icon, label, value }) => (
        <div key={label} className="flex gap-2.5 rounded-md bg-surface-alt p-3">
          <Icon className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
          <div className="min-w-0">
            <dt className="text-xs text-muted">{label}</dt>
            <dd className="text-sm font-semibold leading-snug">{value}</dd>
          </div>
        </div>
      ))}
    </dl>
  );
}

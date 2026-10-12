import { Cpu, HardDrive, Keyboard, MemoryStick, Monitor, MonitorSmartphone } from "lucide-react";
import { formatScreenSize, formatStorage } from "@/domain/catalog/format";
import { keyboardLabel } from "@/domain/catalog/keyboard";
import {
  explainCpu,
  explainDisplay,
  explainGpu,
  explainKeyboard,
  explainRam,
  explainStorage,
} from "@/domain/catalog/spec-explanations";
import type { CatalogItem } from "@/domain/catalog/types";

/**
 * 6 olulisemat väärtust (CPU, RAM, salvestus, ekraan, graafika, klaviatuur) + lühike selgitus (deterministlikud reeglid).
 * Puuduva väärtusega kasti ei kuvata.
 */
export function QuickSpecs({ item }: { item: CatalogItem }) {
  const { product, variant } = item;
  const specs = [
    { icon: Cpu, label: "Protsessor", value: variant.cpu.model.replace(/^(Intel|AMD)\s+/, ""), note: explainCpu(item) },
    { icon: MemoryStick, label: "Mälu", value: variant.ramGb ? `${variant.ramGb} GB RAM` : null, note: explainRam(item) },
    {
      icon: HardDrive,
      label: "Salvestus",
      value: variant.storageGb ? `${formatStorage(variant.storageGb)} SSD` : null,
      note: explainStorage(item),
    },
    {
      icon: Monitor,
      label: "Ekraan",
      value: [product.screenSizeIn && formatScreenSize(product.screenSizeIn), variant.display.resolutionLabel].filter(Boolean).join(" ") || null,
      note: explainDisplay(item),
    },
    { icon: MonitorSmartphone, label: "Graafika", value: variant.gpu.model || null, note: explainGpu(item) },
    { icon: Keyboard, label: "Klaviatuur", value: variant.keyboardLayout ? keyboardLabel(variant.keyboardLayout) : null, note: explainKeyboard(item) },
  ].filter((spec) => Boolean(spec.value));

  if (specs.length === 0) return null;
  return (
    <section aria-labelledby="pohiandmed" className="overflow-hidden rounded-xl border border-border bg-surface">
      <h2 id="pohiandmed" className="sr-only">
        Põhiandmed
      </h2>
      {/* Kompaktne tehniline hierarhia: ikoon, nimetus, väärtus, lühike selgitus; -mb-px peidab viimase rea alumise joone */}
      <dl className="-mb-px grid sm:grid-cols-2">
        {specs.map(({ icon: Icon, label, value, note }) => (
          <div key={label} className="flex gap-3 border-b border-border px-4 py-3 sm:odd:border-r">
            <Icon className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
            <div className="min-w-0">
              <dt className="text-xs text-muted">{label}</dt>
              <dd className="text-sm font-semibold leading-snug">{value}</dd>
              {note && <dd className="mt-0.5 text-xs leading-snug text-muted">{note}</dd>}
            </div>
          </div>
        ))}
      </dl>
    </section>
  );
}

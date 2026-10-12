import { Cpu, HardDrive, Keyboard, MemoryStick, Monitor, MonitorSmartphone, Scale, ShieldCheck, AppWindow, type LucideIcon } from "lucide-react";
import { buildQuickSpecs, type QuickSpecKey } from "@/domain/catalog/quick-specs";
import type { CatalogItem } from "@/domain/catalog/types";
import { cx } from "@/components/ui/class-names";

const ICONS: Record<QuickSpecKey, LucideIcon> = {
  cpu: Cpu,
  ram: MemoryStick,
  storage: HardDrive,
  display: Monitor,
  keyboard: Keyboard,
  gpu: MonitorSmartphone,
  weight: Scale,
  os: AppWindow,
  warranty: ShieldCheck,
};

/**
 * Olulisemad väärtused (CPU, RAM, salvestus, ekraan, klaviatuur, graafika) + lühike selgitus (deterministlikud reeglid).
 * Kastid tulevad domain/catalog/quick-specs.ts-ist: puuduvat ei kuvata ja tühja lahtrit ruudustikku ei jää.
 */
export function QuickSpecs({ item }: { item: CatalogItem }) {
  const specs = buildQuickSpecs(item);
  if (specs.length === 0) return null;
  return (
    <section aria-labelledby="pohiandmed" className="overflow-hidden rounded-xl border border-border bg-surface">
      <h2 id="pohiandmed" className="sr-only">
        Põhiandmed
      </h2>
      {/* Kompaktne tehniline hierarhia: ikoon, nimetus, väärtus, lühike selgitus; -mb-px peidab viimase rea alumise joone */}
      <dl className="-mb-px grid sm:grid-cols-2">
        {specs.map(({ key, label, value, note, wide }) => {
          const Icon = ICONS[key];
          return (
            <div key={key} className={cx("flex gap-3 border-b border-border px-4 py-3", wide ? "sm:col-span-2" : "sm:odd:border-r")}>
              <Icon className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
              <div className="min-w-0">
                <dt className="text-xs text-muted">{label}</dt>
                <dd className="text-sm font-semibold leading-snug">{value}</dd>
                {note && <dd className="mt-0.5 text-xs leading-snug text-muted">{note}</dd>}
              </div>
            </div>
          );
        })}
      </dl>
    </section>
  );
}

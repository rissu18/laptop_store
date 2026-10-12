import { formatScreenSize, formatStorage, formatWeight } from "./format";
import { keyboardLabel } from "./keyboard";
import { explainCpu, explainDisplay, explainGpu, explainKeyboard, explainRam, explainStorage } from "./spec-explanations";
import type { CatalogItem } from "./types";

/**
 * Tootelehe kiirinfo kastid (2 veergu). Järjekord: Protsessor, Mälu, Salvestus, Ekraan, Klaviatuur, Graafika.
 *
 * - Väärtused tulevad samast efektiivsest kirjest (CatalogItem) mis "Tehnilised andmed" — kui tehnilistes andmetes on
 *   graafika või klaviatuur, on see ka siin (sama väli, sama tarnija toorväärtuse varu).
 * - Puuduva väärtusega kasti ei kuvata. Paaritu arvu korral lisatakse järgmine päriselt olemasolev oluline omadus
 *   (kaal, operatsioonisüsteem, garantii); kui ka seda pole, on viimane kast täislaiuses — TÜHJA KASTI EI OLE.
 */

export type QuickSpecKey = "cpu" | "ram" | "storage" | "display" | "keyboard" | "gpu" | "weight" | "os" | "warranty";

export interface QuickSpec {
  key: QuickSpecKey;
  label: string;
  value: string;
  note: string | null;
  /** Viimane kast üle mõlema veeru (paaritu arv, täitjat polnud) */
  wide?: boolean;
}

export function buildQuickSpecs(item: CatalogItem): QuickSpec[] {
  const { product, variant } = item;
  const keyboard = variant.keyboardLayout ? keyboardLabel(variant.keyboardLayout) : (variant.details.keyboardRaw ?? null);
  const primary: (Omit<QuickSpec, "value"> & { value: string | null })[] = [
    { key: "cpu", label: "Protsessor", value: variant.cpu.model.replace(/^(Intel|AMD)\s+/, "") || null, note: explainCpu(item) },
    { key: "ram", label: "Mälu", value: variant.ramGb ? `${variant.ramGb} GB RAM` : null, note: explainRam(item) },
    { key: "storage", label: "Salvestus", value: variant.storageGb ? `${formatStorage(variant.storageGb)} SSD` : null, note: explainStorage(item) },
    {
      key: "display",
      label: "Ekraan",
      value: [product.screenSizeIn && formatScreenSize(product.screenSizeIn), variant.display.resolutionLabel].filter(Boolean).join(" ") || null,
      note: explainDisplay(item),
    },
    { key: "keyboard", label: "Klaviatuur", value: keyboard, note: variant.keyboardLayout ? explainKeyboard(item) : null },
    { key: "gpu", label: "Graafika", value: variant.gpu.model.trim() || null, note: explainGpu(item) },
  ];
  const specs = primary.filter((s): s is QuickSpec => Boolean(s.value));

  if (specs.length % 2 === 1) {
    const weightKg = variant.weightKg ?? product.weightKg;
    const extras: QuickSpec[] = [
      ...(weightKg ? [{ key: "weight" as const, label: "Kaal", value: formatWeight(weightKg), note: null }] : []),
      ...(variant.os ? [{ key: "os" as const, label: "Operatsioonisüsteem", value: variant.os, note: null }] : []),
      ...(variant.warrantyMonths ? [{ key: "warranty" as const, label: "Garantii", value: `${variant.warrantyMonths} kuud`, note: null }] : []),
    ];
    if (extras.length) specs.push(extras[0]);
    else specs[specs.length - 1] = { ...specs[specs.length - 1], wide: true };
  }
  return specs;
}

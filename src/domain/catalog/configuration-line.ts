import { GRADES, type GradeCode } from "@/domain/grade/grades";
import { isInStore } from "./configuration-order";
import { formatScreenSize, formatStorage } from "./format";
import { keyboardLabel } from "./keyboard";
import type { CatalogProduct, CatalogVariant } from "./types";

/**
 * Tootelehe konfiguratsioonirea tekstid (kompaktsed, aga loetavad):
 *   "i5-1345U · 16 GB · 256 GB"
 *   "Seisukord A · Skandinaavia (SCA) · 14" · WUXGA · Tarne 2–4 päeva"
 */

/** Lühike seisukord konfiguratsiooni juures: "Seisukord A" (mitte "A · Väga hea"); uus kaup → "Uus" */
export function gradeShortLabel(code: GradeCode): string {
  const info = GRADES[code];
  if (!info) return `Seisukord ${code}`;
  return info.showCode ? `Seisukord ${info.code}` : info.label;
}

/**
 * Tarneaeg inimkeeles (olemasolevast laoseisu/tarnija loogikast):
 *   - täpne kogus teadmata ja tarneaega pole (Laptopid.ee — sama ettevõtte salong) → "Poes kohapeal"
 *   - pakkumisel on tarneaeg (Tech 1–2, Foxway 2–4 tööpäeva) → "Tarne 1–2 päeva"
 *   - muidu poe üldine tarneaeg → "Tarne 1–10 päeva"
 */
export function deliveryShortLabel(variant: Pick<CatalogVariant, "stock" | "delivery">): string {
  if (variant.delivery) {
    const { minDays, maxDays } = variant.delivery;
    return minDays === maxDays ? `Tarne ${minDays} ${minDays === 1 ? "päev" : "päeva"}` : `Tarne ${minDays}–${maxDays} päeva`;
  }
  if (isInStore(variant)) return "Poes kohapeal";
  return "Tarne 1–10 päeva";
}

/** "WUXGA"; nime puudumisel "1920 × 1200"; teadmata → null */
export function resolutionShortLabel(display: CatalogVariant["display"]): string | null {
  if (display.resolutionLabel?.trim()) return display.resolutionLabel.trim();
  const match = display.resolution?.match(/^(\d{3,4})\s*[x×]\s*(\d{3,4})$/i);
  return match ? `${match[1]} × ${match[2]}` : (display.resolution?.trim() || null);
}

export function configurationSpecLine(variant: Pick<CatalogVariant, "cpu" | "ramGb" | "storageGb">): string {
  return `${variant.cpu.model.replace(/^(Intel|AMD)\s+(Core\s+)?/, "")} · ${variant.ramGb} GB · ${formatStorage(variant.storageGb)}`;
}

export function configurationDetails(product: Pick<CatalogProduct, "screenSizeIn">, variant: CatalogVariant): string[] {
  return [
    gradeShortLabel(variant.grade),
    variant.keyboardLayout ? keyboardLabel(variant.keyboardLayout) : null,
    variant.display.touch ? "Puuteekraan" : null,
    product.screenSizeIn ? formatScreenSize(product.screenSizeIn) : null,
    resolutionShortLabel(variant.display),
    deliveryShortLabel(variant),
  ].filter((part): part is string => Boolean(part));
}

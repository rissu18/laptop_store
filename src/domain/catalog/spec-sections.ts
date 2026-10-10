import { GRADES } from "@/domain/grade/grades";
import { BRAND_NAMES, type CatalogItem } from "./types";
import { cpuGenerationLabel } from "./facets";
import { FEATURE_LABELS } from "./features";
import { formatScreenSize, formatWeight } from "./format";

/**
 * Tehnilised andmed rühmadena. Puuduva väärtusega rida jäetakse välja —
 * kasutaja ei näe kunagi "—" või "Andmed puuduvad" ridu.
 */

export interface SpecRow {
  label: string;
  value: string;
}

export interface SpecSection {
  title: string;
  rows: SpecRow[];
}

type Maybe = string | number | boolean | null | undefined;

function yesNo(value: boolean | null): string | null {
  if (value === null) return null;
  return value ? "Jah" : "Ei";
}

/** Väärtused, mida ei kuvata kunagi (tarnija "tühjad" väärtused). */
const EMPTY_VALUES = new Set(["", "-", "–", "n/a", "na", "unknown", "null", "undefined", "none"]);

function row(label: string, value: Maybe): SpecRow | null {
  if (value === null || value === undefined || value === false) return null;
  const text = String(value).trim();
  if (EMPTY_VALUES.has(text.toLowerCase())) return null;
  return { label, value: text };
}

function section(title: string, rows: (SpecRow | null)[]): SpecSection | null {
  const present = rows.filter((r): r is SpecRow => r !== null);
  return present.length ? { title, rows: present } : null;
}

export function buildSpecSections({ product, variant }: CatalogItem): SpecSection[] {
  const f = variant.features;
  const count = (n: number | null) => (n === null ? null : n > 0 ? `${n} tk` : null);

  return [
    // Protsessor, RAM ja SSD on juba tootelehe kiirinfo kastides — siin neid ei korrata
    section("Jõudlus", [
      row("Protsessori põlvkond", variant.cpu.generationKey ? cpuGenerationLabel(variant.cpu.generationKey) : null),
      row("Mälu tüüp", variant.ramType),
      row("Graafika", variant.gpu.model),
    ]),
    section("Ekraan", [
      row("Suurus", formatScreenSize(product.screenSizeIn)),
      row(
        "Resolutsioon",
        variant.display.resolution
          ? `${variant.display.resolution.replace("x", " × ")}${variant.display.resolutionLabel ? ` (${variant.display.resolutionLabel})` : ""}`
          : null,
      ),
      row("Paneel", variant.display.panel),
      row("Puuteekraan", yesNo(variant.display.touch)),
      row("360° pööratav", f.convertible ? "Jah" : null),
    ]),
    section("Ühendused", [
      row("USB-A", count(product.ports.usbA)),
      row("USB-C", count(product.ports.usbC)),
      row("Thunderbolt", yesNo(f.thunderbolt)),
      row("HDMI", yesNo(f.hdmi)),
      row("LAN (RJ45)", yesNo(f.lan)),
      row("SD-kaardilugeja", yesNo(f["sd-reader"])),
      row("Wi-Fi", product.wifi),
      row("Bluetooth", product.bluetooth),
      row("Mobiilne internet", f["5g"] ? "5G" : f.lte ? "4G / LTE" : null),
    ]),
    section("Füüsilised omadused", [
      row("Kaal", product.weightKg ? formatWeight(product.weightKg) : null),
      row("Klaviatuur", variant.keyboardLayout),
      row("Klaviatuuri taustavalgus", yesNo(f.backlit)),
      row("Numbriklahvistik", yesNo(f.numpad)),
    ]),
    section("Turvalisus", [
      row("Sõrmejäljelugeja", yesNo(f.fingerprint)),
      row("IR-kaamera", yesNo(f["ir-camera"])),
      // "Smart Card lugeja", mitte "ID-kaardilugeja": Eesti ID-kaardi tuge pole kinnitatud
      row(FEATURE_LABELS.smartcard, yesNo(f.smartcard)),
    ]),
    section("Muu", [
      row("Operatsioonisüsteem", variant.os),
      row("Aku seisukord", variant.batteryHealthPct !== null ? `vähemalt ${variant.batteryHealthPct}%` : null),
      row("Laadija komplektis", yesNo(variant.chargerIncluded)),
      row("Garantii", variant.warrantyMonths ? `${variant.warrantyMonths} kuud` : null),
      row("Seisukord", `${variant.grade} · ${GRADES[variant.grade].label}`),
      row("Tootja", BRAND_NAMES[product.brand]),
      row("SKU", variant.sku),
    ]),
  ].filter((s): s is SpecSection => s !== null);
}

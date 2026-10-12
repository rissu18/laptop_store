import { gradeDisplay } from "@/domain/grade/grades";
import { BRAND_NAMES, type CatalogItem } from "./types";
import { cpuGenerationLabel } from "./facets";
import { FEATURE_LABELS } from "./features";
import { keyboardLabel } from "./keyboard";
import { formatBenchmark, formatGhz } from "./benchmarks";
import { formatScreenSize, formatStorage, formatWeight } from "./format";

/**
 * Tehnilised andmed rühmadena. Puuduva väärtusega rida jäetakse välja —
 * kasutaja ei näe kunagi "—" või "Andmed puuduvad" ridu.
 */

export interface SpecRow {
  label: string;
  value: string;
  /** Kõige olulisemad read (protsessor, mälu, salvestus, graafika, ekraan) — tugevam väärtus, kiiresti skannitav */
  emphasis?: boolean;
  /** Info-ikoon selgitusega (kiirusindeks: CPU = 3DMark06 CPU, GPU = 3DMark11 GPU) */
  info?: "cpu-benchmark" | "gpu-benchmark";
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

function row(label: string, value: Maybe, extra: Pick<SpecRow, "emphasis" | "info"> = {}): SpecRow | null {
  if (value === null || value === undefined || value === false) return null;
  const text = String(value).trim();
  if (EMPTY_VALUES.has(text.toLowerCase())) return null;
  return { label, value: text, ...extra };
}

/** Kiirusindeks ainult positiivse arvuna; puudub / 0 → rida puudub */
const benchmarkValue = (value: number | null | undefined) => (value && value > 0 ? formatBenchmark(value) : null);

function section(title: string, rows: (SpecRow | null)[]): SpecSection | null {
  const present = rows.filter((r): r is SpecRow => r !== null);
  return present.length ? { title, rows: present } : null;
}

export function buildSpecSections({ product, variant }: CatalogItem): SpecSection[] {
  const f = variant.features;
  const d = variant.details;
  const count = (n: number | null) => (n === null ? null : n > 0 ? `${n} tk` : null);
  // Konfiguratsiooni (pakkumise) andmed on täpsemad kui mudeli üldandmed — neid eelistatakse
  const usbA = d.usbA ?? product.ports.usbA;
  const usbC = d.usbC ?? product.ports.usbC;
  const weightKg = variant.weightKg ?? product.weightKg;
  const thunderbolt = d.thunderbolt ? `Jah (Thunderbolt ${d.thunderbolt.replace("+", " ja ")})` : yesNo(f.thunderbolt);

  return [
    // Jõudlus: kõigepealt komponent (protsessori täisnimi), siis selle andmed; mälu ja salvestus päris ridadena
    section("Jõudlus", [
      row("Protsessor", variant.cpu.model, { emphasis: true }),
      row("Maks. sagedus", variant.cpu.maxGhz ? formatGhz(variant.cpu.maxGhz) : null),
      row("Kiirusindeks", benchmarkValue(variant.cpu.benchmark), { info: "cpu-benchmark" }),
      row("Protsessori põlvkond", variant.cpu.generationKey ? cpuGenerationLabel(variant.cpu.generationKey) : null),
      row("Mälu", variant.ramGb ? `${variant.ramGb} GB` : null, { emphasis: true }),
      row("Mälu tüüp", variant.ramType),
      row("Salvestus", variant.storageGb ? `${formatStorage(variant.storageGb)} SSD` : null, { emphasis: true }),
      row("Lisaketas", d.secondaryStorage),
      row("Graafika", variant.gpu.model, { emphasis: true }),
      row("Kiirusindeks", benchmarkValue(variant.gpu.benchmark), { info: "gpu-benchmark" }),
    ]),
    section("Ekraan", [
      row("Suurus", formatScreenSize(product.screenSizeIn), { emphasis: true }),
      row(
        "Resolutsioon",
        variant.display.resolution
          ? `${variant.display.resolution.replace("x", " × ")}${variant.display.resolutionLabel ? ` (${variant.display.resolutionLabel})` : ""}`
          : // Tarnija annab vahel ainult nime (Apple "Retina") — täpset resolutsiooni ei leiutata
            variant.display.resolutionLabel,
        { emphasis: true },
      ),
      row("Paneel", variant.display.panel),
      row("Puuteekraan", yesNo(variant.display.touch)),
      row("Värskendussagedus", d.refreshRateHz && d.refreshRateHz > 60 ? `${d.refreshRateHz} Hz` : null),
      row("Privaatsusekraan", d.privacyScreen ? "Jah" : null),
      row("360° pööratav", f.convertible ? "Jah" : null),
    ]),
    section("Ühendused", [
      row("USB-A", count(usbA)),
      row("USB-C", count(usbC)),
      row("Thunderbolt", thunderbolt),
      row("HDMI", yesNo(f.hdmi)),
      row("DisplayPort", d.displayPort ? "Jah" : null),
      row("VGA", d.vga ? "Jah" : null),
      row("LAN (RJ45)", yesNo(f.lan)),
      row("SD-kaardilugeja", yesNo(f["sd-reader"])),
      row("Wi-Fi", product.wifi),
      row("Bluetooth", product.bluetooth),
      row("Mobiilne internet", f["5g"] ? "5G" : f.lte ? "4G / LTE" : null),
    ]),
    section("Füüsilised omadused", [
      row("Kaal", weightKg ? formatWeight(weightKg) : null),
      row("Klaviatuur", variant.keyboardLayout ? keyboardLabel(variant.keyboardLayout) : d.keyboardRaw),
      row("Klaviatuuri taustavalgus", yesNo(f.backlit)),
      row("Numbriklahvistik", yesNo(f.numpad)),
      row("TrackPoint (osutuskang)", d.pointingStick ? "Jah" : null),
    ]),
    section("Turvalisus", [
      row("Sõrmejäljelugeja", yesNo(f.fingerprint)),
      row("IR-kaamera", yesNo(f["ir-camera"])),
      // "Smart Card lugeja", mitte "ID-kaardilugeja": Eesti ID-kaardi tuge pole kinnitatud
      row(FEATURE_LABELS.smartcard, yesNo(f.smartcard)),
      row("Veebikaamera", yesNo(d.webcam ?? null)),
    ]),
    section("Muu", [
      row("Operatsioonisüsteem", variant.os),
      row("Aku seisukord", variant.batteryHealthPct !== null ? `vähemalt ${variant.batteryHealthPct}%` : null),
      row("Laadija komplektis", variant.chargerIncluded === true && d.chargerLabel ? (d.originalBox ? "Jah, koos originaalkarbiga" : "Jah") : yesNo(variant.chargerIncluded)),
      row("Garantii", variant.warrantyMonths ? `${variant.warrantyMonths} kuud` : null),
      row("Aku garantii", d.batteryWarrantyMonths ? `${d.batteryWarrantyMonths} kuud` : null),
      row("Seisukord", gradeDisplay(variant.grade)),
      row("Märkus seisukorra kohta", variant.conditionNotes ?? (d.conditionNotices?.length ? d.conditionNotices.map((n) => n.text).join(" ") : null)),
      row("Tootja", BRAND_NAMES[product.brand]),
      row("SKU", variant.sku),
    ]),
  ].filter((s): s is SpecSection => s !== null);
}

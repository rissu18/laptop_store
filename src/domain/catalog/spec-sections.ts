import { GRADES } from "@/domain/grade/grades";
import { BRAND_NAMES, type CatalogItem } from "./types";
import { formatScreenSize, formatStorage, formatWeight } from "./format";

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

function row(label: string, value: Maybe): SpecRow | null {
  if (value === null || value === undefined || value === "") return null;
  return { label, value: String(value) };
}

function section(title: string, rows: (SpecRow | null)[]): SpecSection | null {
  const present = rows.filter((r): r is SpecRow => r !== null);
  return present.length ? { title, rows: present } : null;
}

export function buildSpecSections({ product, variant }: CatalogItem): SpecSection[] {
  const f = variant.features;
  const count = (n: number | null) => (n === null ? null : n > 0 ? `${n} tk` : null);

  return [
    section("Jõudlus", [
      row("Protsessor", variant.cpu.model),
      row("Mälu (RAM)", `${variant.ramGb} GB`),
      row("Mälu tüüp", variant.ramType),
      row("Salvestus", `${formatStorage(variant.storageGb)} SSD`),
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
      row("Kaal", product.weightKg !== null ? formatWeight(product.weightKg) : null),
      row("Klaviatuur", variant.keyboardLayout),
      row("Klaviatuuri taustavalgus", yesNo(f.backlit)),
      row("Numbriklahvistik", yesNo(f.numpad)),
    ]),
    section("Turvalisus", [
      row("Sõrmejäljelugeja", yesNo(f.fingerprint)),
      row("IR-kaamera", yesNo(f["ir-camera"])),
      row("ID-kaardilugeja", yesNo(f.smartcard)),
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

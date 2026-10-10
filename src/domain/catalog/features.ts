import type { FeatureKey } from "./types";

/** Kerge sülearvuti piir kilogrammides ("Kerge" filter). */
export const LIGHT_LAPTOP_MAX_KG = 1.4;

export const FEATURE_LABELS: Record<FeatureKey, string> = {
  touch: "Puuteekraan",
  convertible: "360° pööratav (2-in-1)",
  numpad: "Numbriklahvistik",
  backlit: "Taustavalgustusega klaviatuur",
  fingerprint: "Sõrmejäljelugeja",
  "ir-camera": "IR-kaamera (Windows Hello)",
  // Sisemine võti on "smartcard" (Smart Card lugeja). EI tähenda kinnitatud Eesti ID-kaardi tuge —
  // selleks oleks vaja eraldi tarnija/tootja kinnitust (päris tarnija mapping tuleb hiljem).
  smartcard: "Smart Card lugeja",
  lte: "4G / LTE",
  "5g": "5G",
  thunderbolt: "Thunderbolt",
  "usb-c": "USB-C",
  hdmi: "HDMI",
  lan: "LAN (RJ45)",
  "sd-reader": "SD-kaardilugeja",
  "dedicated-gpu": "Eraldi graafikakaart",
  "nvidia-rtx": "NVIDIA RTX",
  "windows-11": "Windows 11",
  light: `Kerge (kuni ${String(LIGHT_LAPTOP_MAX_KG).replace(".", ",")} kg)`,
};

/** Järjekord "Täpsemad filtrid" paneelis. */
export const FEATURE_ORDER: FeatureKey[] = [
  "light",
  "touch",
  "convertible",
  "numpad",
  "backlit",
  "fingerprint",
  "ir-camera",
  "smartcard",
  "lte",
  "5g",
  "thunderbolt",
  "usb-c",
  "hdmi",
  "lan",
  "sd-reader",
  "dedicated-gpu",
  "nvidia-rtx",
  "windows-11",
];

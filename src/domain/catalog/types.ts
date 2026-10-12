import type { Cents } from "@/domain/money/money";
import type { GradeCode } from "@/domain/grade/grades";
import type { ProductImageView } from "@/domain/images/product-image";
import type { StockInfo } from "./availability";
import type { ListingDetails } from "./listing-details";

/**
 * Kataloogi normaliseeritud andmemudel.
 * Need tüübid on AVALIKUD — need võivad jõuda brauserisse.
 * Seetõttu ei ole siin ostuhinda ega tarnija andmeid (vt server/catalog).
 */

export const BRAND_CODES = ["lenovo", "dell", "hp", "fujitsu", "samsung", "apple", "microsoft", "panasonic", "asus", "acer", "getac"] as const;
export type BrandCode = (typeof BRAND_CODES)[number];

export const BRAND_NAMES: Record<BrandCode, string> = {
  lenovo: "Lenovo",
  dell: "Dell",
  hp: "HP",
  fujitsu: "Fujitsu",
  samsung: "Samsung",
  apple: "Apple",
  microsoft: "Microsoft",
  panasonic: "Panasonic",
  asus: "ASUS",
  acer: "Acer",
  getac: "Getac",
};

export const CPU_FAMILIES = [
  "intel-core-i3",
  "intel-core-i5",
  "intel-core-i7",
  "intel-core-i9",
  "intel-core-ultra-5",
  "intel-core-ultra-7",
  "amd-ryzen-3",
  "amd-ryzen-5",
  "amd-ryzen-7",
  "amd-ryzen-9",
] as const;
export type CpuFamily = (typeof CPU_FAMILIES)[number];

export const KEYBOARD_LAYOUTS = ["SWE", "NOR", "EST", "US", "UK", "DE"] as const;
export type KeyboardLayout = (typeof KEYBOARD_LAYOUTS)[number];

/**
 * Kas hinnas sisalduvat käibemaksu käsitletakse tavakorras (24% kogu hinnalt)
 * või kasutatud kauba erikorras (KM ainult juurdehindluselt). Vt docs/PROJECT_PLAN.md R1.
 */
export type VatScheme = "STANDARD" | "MARGIN" | "UNKNOWN";

/** Omadused, mille järgi saab filtreerida. `null` = andmed puuduvad. */
export const FEATURE_KEYS = [
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
  "light",
] as const;
export type FeatureKey = (typeof FEATURE_KEYS)[number];
export type FeatureFlags = Record<FeatureKey, boolean | null>;

/** Mudel: "Lenovo ThinkPad T14 Gen 3". Stabiilne, oma URL-iga. */
export interface CatalogProduct {
  id: string;
  slug: string;
  brand: BrandCode;
  series: string;
  model: string;
  /** "Lenovo ThinkPad T14 Gen 3" */
  title: string;
  screenSizeIn: number;
  weightKg: number | null;
  ports: { usbA: number | null; usbC: number | null };
  wifi: string | null;
  bluetooth: string | null;
  /** Mudeli pildid (nt Icecat) — ühised kõigile selle mudeli konfiguratsioonidele */
  images: ProductImageView[];
}

/** Müüdav konfiguratsioon. Filtrid töötavad selle tasemel. */
export interface CatalogVariant {
  id: string;
  sku: string;
  grade: GradeCode;
  cpu: {
    /** "Intel Core i5-1235U" */
    model: string;
    family: CpuFamily | null;
    /** filtri võti, nt "intel-12", "amd-5000", "ultra-1" */
    generationKey: string | null;
  };
  ramGb: number;
  ramType: string | null;
  storageGb: number;
  gpu: { model: string; dedicated: boolean };
  display: {
    resolution: string | null;
    resolutionLabel: string | null;
    panel: string | null;
    touch: boolean | null;
  };
  keyboardLayout: KeyboardLayout | null;
  features: FeatureFlags;
  os: string | null;
  batteryHealthPct: number | null;
  chargerIncluded: boolean | null;
  warrantyMonths: number | null;
  price: {
    saleCents: Cents;
    /** Ainult PÄRIS varasem hind hinnaajaloost. Kunagi väljamõeldud. */
    referenceCents: Cents | null;
    vatScheme: VatScheme;
  };
  /** Saadavus + täpne kogus (`null` = tarnija ei anna kogust). Vt domain/catalog/availability.ts */
  stock: StockInfo;
  /** Tarneaeg tarnija andmetest; `null` = teadmata → UI ei kuva tarneaega. Vaikeväärtust EI panda. */
  delivery: { minDays: number; maxDays: number } | null;
  /** ISO kuupäev, millal toode esimest korda meie süsteemi tuli */
  firstSeenAt: string;
  /** ISO kuupäev, viimane edukas sync. `null` = sync pole veel töötanud. */
  lastSyncedAt: string | null;
  isFeatured: boolean;
  /** Konfiguratsiooni kaal, kui tarnija annab selle pakkumise tasemel (muidu kehtib mudeli kaal) */
  weightKg: number | null;
  /** Tarnija märkus seisukorra kohta (lihttekst) */
  conditionNotes: string | null;
  /** Struktureeritud lisaandmed (pordid jms) — vt ListingDetails */
  details: ListingDetails;
  /** Pildid konkreetsest müüdavast seadmest (ACTUAL_UNIT), kui tarnija neid annab */
  images: ProductImageView[];
}

/** Nimekirja kirje: mudel + üks konfiguratsioon. */
export interface CatalogItem {
  product: CatalogProduct;
  variant: CatalogVariant;
}

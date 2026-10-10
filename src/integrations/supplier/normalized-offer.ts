import type { Cents } from "@/domain/money/money";
import type { GradeCode } from "@/domain/grade/grades";
import type {
  BrandCode,
  CpuFamily,
  FeatureFlags,
  KeyboardLayout,
  VatScheme,
} from "@/domain/catalog/types";

/**
 * Tarnija pakkumine meie normaliseeritud kujul.
 * Sisaldab ostuhinda — seega ainult serveris kasutamiseks, mitte brauserisse.
 */
export interface NormalizedOffer {
  supplierCode: string;
  externalId: string;
  /** GTIN/EAN ja tootja kood (MPN), kui tarnija need annab — Icecati vaste jaoks kõige täpsemad */
  gtin: string | null;
  mpn: string | null;

  // Mudel (Product)
  brand: BrandCode;
  series: string;
  model: string;
  screenSizeIn: number;
  weightKg: number | null;
  usbAPorts: number | null;
  usbCPorts: number | null;
  wifi: string | null;
  bluetooth: string | null;

  // Konfiguratsioon (ProductVariant)
  grade: GradeCode;
  cpuModel: string;
  cpuFamily: CpuFamily | null;
  cpuGenerationKey: string | null;
  ramGb: number;
  ramType: string | null;
  storageGb: number;
  gpuModel: string;
  gpuDedicated: boolean;
  resolution: string | null;
  resolutionLabel: string | null;
  panel: string | null;
  keyboardLayout: KeyboardLayout | null;
  features: FeatureFlags;
  os: string | null;
  batteryHealthPct: number | null;
  chargerIncluded: boolean | null;
  warrantyMonths: number | null;
  imageUrls: string[];
  imagesAreIllustrative: boolean;

  // Tarnija pakkumine (SupplierListing)
  costCents: Cents;
  vatScheme: VatScheme;
  stockQuantity: number;
  /** Tarnija teatatud kuupäev, millal toode lisati (kui on) */
  listedAt: string | null;
}

import { z } from "zod";
import { parseSupplierGrade } from "@/domain/grade/grades";
import { eurosToCents } from "@/domain/money/money";
import { LIGHT_LAPTOP_MAX_KG } from "@/domain/catalog/features";
import type { FeatureFlags } from "@/domain/catalog/types";
import type { NormalizedOffer } from "../normalized-offer";
import { parseBrand, splitSeries } from "../model-names";
import { parseCpu, parseDisplay, parseKeyboardLayout, parseRam, parseStorageGb } from "../spec-parsers";
import type {
  SupplierAdapter,
  SupplierAvailability,
  SupplierCatalogResult,
  SupplierOrderInput,
  SupplierOrderResult,
  SupplierOrderStatusResult,
  TrackingInfo,
} from "../supplier-adapter";
import { MOCK_SUPPLIER_RECORDS, type MockSupplierRecord } from "./mock-supplier-data";

/**
 * Mock-tarnija arenduseks ja testideks.
 * Käitub nagu päris adapter: valideerib toorandmed, normaliseerib, lükkab vigased kirjed tagasi.
 */

/** Tarnija vastuse skeem — päris API vastust ei usaldata kunagi pimesi. */
const mockRecordSchema = z.object({
  sku: z.string().min(1),
  ean: z.string().regex(/^\d{8,14}$/).nullish(),
  mpn: z.string().max(40).nullish(),
  manufacturer: z.string().min(1),
  model_name: z.string().min(1),
  cpu: z.string().min(1),
  ram: z.string().min(1),
  storage: z.string().min(1),
  display: z.string().min(1),
  gpu: z.string().min(1),
  gpu_dedicated: z.boolean().optional(),
  keyboard: z.string().nullable(),
  condition: z.string().min(1),
  os: z.string().nullable(),
  weight_kg: z.number().positive().max(5).nullable(),
  usb_a: z.number().int().min(0).nullable(),
  usb_c: z.number().int().min(0).nullable(),
  wifi: z.string().nullable(),
  bluetooth: z.string().nullable(),
  features: z.array(z.string()),
  price_eur: z.number().positive(),
  vat: z.enum(["standard", "margin"]),
  qty: z.number().int().min(0),
  warranty_months: z.number().int().positive().nullable(),
  battery_health: z.number().int().min(0).max(100).nullable(),
  charger: z.boolean().nullable(),
  images: z.array(z.string()),
  listed_at: z.string().datetime(),
});

class NormalizationError extends Error {}

function buildFeatures(record: MockSupplierRecord, touch: boolean): FeatureFlags {
  const has = (name: string) => record.features.includes(name);
  const gpu = record.gpu.toUpperCase();
  return {
    touch,
    convertible: has("x360"),
    numpad: has("numpad"),
    backlit: has("backlit"),
    fingerprint: has("fingerprint"),
    "ir-camera": has("ir_camera"),
    smartcard: has("smartcard"),
    lte: has("lte") || has("5g"),
    "5g": has("5g"),
    thunderbolt: has("thunderbolt"),
    "usb-c": has("usb_c") || (record.usb_c ?? 0) > 0,
    hdmi: has("hdmi"),
    lan: has("rj45"),
    "sd-reader": has("sd"),
    "dedicated-gpu": record.gpu_dedicated === true,
    "nvidia-rtx": record.gpu_dedicated === true && /\bRTX\b/.test(gpu),
    "windows-11": record.os ? /windows 11/i.test(record.os) : null,
    light: record.weight_kg !== null ? record.weight_kg <= LIGHT_LAPTOP_MAX_KG : null,
  };
}

export function normalizeMockRecord(record: MockSupplierRecord, supplierCode: string): NormalizedOffer {
  const fail = (message: string): never => {
    throw new NormalizationError(message);
  };

  const brand = parseBrand(record.manufacturer) ?? fail(`Tundmatu tootja: ${record.manufacturer}`);
  const names = splitSeries(record.model_name) ?? fail(`Tundmatu seeria: ${record.model_name}`);
  const grade = parseSupplierGrade(record.condition) ?? fail(`Tundmatu seisukord: ${record.condition}`);
  const ram = parseRam(record.ram) ?? fail(`RAM-i ei õnnestunud lugeda: ${record.ram}`);
  const storageGb = parseStorageGb(record.storage) ?? fail(`Salvestust ei õnnestunud lugeda: ${record.storage}`);
  const display = parseDisplay(record.display) ?? fail(`Ekraani ei õnnestunud lugeda: ${record.display}`);
  const cpu = parseCpu(record.cpu);

  return {
    supplierCode,
    externalId: record.sku,
    gtin: record.ean ?? null,
    mpn: record.mpn ?? null,
    brand,
    series: names.series,
    model: names.model,
    screenSizeIn: display.sizeIn,
    weightKg: record.weight_kg,
    usbAPorts: record.usb_a,
    usbCPorts: record.usb_c,
    wifi: record.wifi,
    bluetooth: record.bluetooth ? `Bluetooth ${record.bluetooth}` : null,
    grade,
    cpuModel: record.cpu,
    cpuFamily: cpu.family,
    cpuGenerationKey: cpu.generationKey,
    ramGb: ram.gb,
    ramType: ram.type,
    storageGb,
    gpuModel: record.gpu,
    gpuDedicated: record.gpu_dedicated === true,
    resolution: display.resolution,
    resolutionLabel: display.resolutionLabel,
    panel: display.panel,
    keyboardLayout: parseKeyboardLayout(record.keyboard),
    features: buildFeatures(record, display.touch),
    os: record.os,
    batteryHealthPct: record.battery_health,
    chargerIncluded: record.charger,
    warrantyMonths: record.warranty_months,
    imageUrls: record.images,
    imagesAreIllustrative: true,
    costCents: eurosToCents(record.price_eur),
    vatScheme: record.vat === "margin" ? "MARGIN" : "STANDARD",
    stockQuantity: record.qty,
    listedAt: record.listed_at,
  };
}

export class MockSupplierAdapter implements SupplierAdapter {
  readonly code = "mock";
  readonly name = "Mock-tarnija (arenduse testandmed)";

  constructor(private readonly records: unknown[] = MOCK_SUPPLIER_RECORDS) {}

  async getProducts(): Promise<SupplierCatalogResult> {
    const result: SupplierCatalogResult = { offers: [], rejected: [] };
    for (const raw of this.records) {
      const parsed = mockRecordSchema.safeParse(raw);
      if (!parsed.success) {
        const externalId = typeof raw === "object" && raw && "sku" in raw ? String(raw.sku) : null;
        result.rejected.push({ externalId, stage: "validate", message: parsed.error.issues[0]?.message ?? "Vigane kirje" });
        continue;
      }
      try {
        result.offers.push(normalizeMockRecord(parsed.data, this.code));
      } catch (error) {
        if (!(error instanceof NormalizationError)) throw error;
        result.rejected.push({ externalId: parsed.data.sku, stage: "normalize", message: error.message });
      }
    }
    return result;
  }

  async getProduct(externalId: string): Promise<NormalizedOffer | null> {
    const { offers } = await this.getProducts();
    return offers.find((offer) => offer.externalId === externalId) ?? null;
  }

  async getAvailability(externalId: string): Promise<SupplierAvailability> {
    const offer = await this.getProduct(externalId);
    return {
      externalId,
      available: (offer?.stockQuantity ?? 0) > 0,
      quantity: offer?.stockQuantity ?? 0,
      costCents: offer?.costCents ?? 0,
    };
  }

  // Tellimuste automaatika tuleb Phase 7-s.
  async createOrder(input: SupplierOrderInput): Promise<SupplierOrderResult> {
    return { ok: true, supplierOrderId: `MOCK-${input.reference}` };
  }

  async getOrderStatus(supplierOrderId: string): Promise<SupplierOrderStatusResult> {
    return { supplierOrderId, status: "ACCEPTED" };
  }

  async getTracking(): Promise<TrackingInfo | null> {
    return null;
  }
}

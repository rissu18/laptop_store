import type { Cents } from "@/domain/money/money";
import type { NormalizedOffer } from "./normalized-offer";

/**
 * Hulgilao adapter.
 *
 * Iga tarnija jaoks tehakse eraldi klass (MockSupplierAdapter, SupplierAAdapter, …),
 * mis tõlgib tarnija API vormingu meie normaliseeritud kujule (`NormalizedOffer`).
 * Ülejäänud rakendus ei tea midagi konkreetse tarnija API struktuurist.
 *
 * Neid meetodeid kutsub AINULT server (sync worker, checkout'i kontroll, tellimuse edastus).
 * Brauser ei suhtle tarnijaga kunagi otse.
 */
export interface SupplierAdapter {
  /** Unikaalne kood, salvestatakse `Supplier.code` välja */
  readonly code: string;
  readonly name: string;

  /** Kõik tarnija tooted, juba valideeritud ja normaliseeritud. Vigased kirjed on `rejected` all. */
  getProducts(): Promise<SupplierCatalogResult>;
  getProduct(externalId: string): Promise<NormalizedOffer | null>;
  /** Reaalajas hind + laoseis (checkout'i eelkontroll). Ühendab spetsifikatsiooni getStock + getPrice. */
  getAvailability(externalId: string): Promise<SupplierAvailability>;

  // Phase 7 — tellimuste automaatika
  createOrder(input: SupplierOrderInput): Promise<SupplierOrderResult>;
  getOrderStatus(supplierOrderId: string): Promise<SupplierOrderStatusResult>;
  getTracking(supplierOrderId: string): Promise<TrackingInfo | null>;
}

export interface SupplierCatalogResult {
  offers: NormalizedOffer[];
  rejected: { externalId: string | null; stage: "validate" | "normalize"; message: string }[];
}

export interface SupplierAvailability {
  externalId: string;
  available: boolean;
  quantity: number;
  costCents: Cents;
}

export interface SupplierOrderInput {
  /** Meie tellimuse number — saadetakse tarnijale viitena ja kasutatakse idempotency võtmena */
  reference: string;
  items: { externalId: string; quantity: number; expectedCostCents: Cents }[];
  shipTo: {
    name: string;
    phone: string;
    email: string;
    method: "parcel-locker" | "courier";
    address: string;
    city: string;
    postalCode: string;
    country: "EE";
    parcelLockerId?: string;
  };
}

export type SupplierOrderResult =
  | { ok: true; supplierOrderId: string }
  | { ok: false; retryable: boolean; error: string };

export type SupplierOrderStatus = "ACCEPTED" | "PROCESSING" | "SHIPPED" | "CANCELLED" | "UNKNOWN";

export interface SupplierOrderStatusResult {
  supplierOrderId: string;
  status: SupplierOrderStatus;
}

export interface TrackingInfo {
  carrier: string;
  trackingCode: string;
  trackingUrl: string | null;
}

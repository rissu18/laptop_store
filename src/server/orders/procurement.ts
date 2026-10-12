import { and, asc, eq, inArray } from "drizzle-orm";
import { PROCUREMENT_SUPPLIERS } from "@/domain/orders/procurement";
import { foxwayMetaOf } from "@/integrations/foxway/foxway-meta";
import type { Database } from "@/server/db/client";
import { orderItemProcurements, orderItems, supplierListings } from "@/server/db/schema";

/**
 * Tellimuse rea hange tarnijalt (vt domain/orders/procurement.ts). Kirje luuakse tellimuse loomisel SAMAS tehingus,
 * kui rida pärineb tarnijast, kellelt kaup tuleb käsitsi tellida (Foxway). Snapshot: tarnija SKU, ItemVariantId,
 * tarnija nimi ja hinnakirja hind tellimuse hetkel. Automaatset tarnija tellimust EI tehta.
 */

type Tx = Parameters<Parameters<Database["transaction"]>[0]>[0];
type Reader = Pick<Database, "select">;

export async function createProcurementRecords(tx: Tx, orderId: string): Promise<number> {
  const rows = await tx
    .select({ itemId: orderItems.id, supplier: supplierListings.supplier, supplierProductId: supplierListings.supplierProductId, rawData: supplierListings.rawData })
    .from(orderItems)
    .innerJoin(supplierListings, eq(orderItems.supplierListingId, supplierListings.id))
    .where(and(eq(orderItems.orderId, orderId), inArray(supplierListings.supplier, [...PROCUREMENT_SUPPLIERS])));
  if (!rows.length) return 0;
  await tx
    .insert(orderItemProcurements)
    .values(
      rows.map((row) => {
        const meta = foxwayMetaOf(row.rawData);
        return {
          orderItemId: row.itemId,
          supplier: row.supplier,
          supplierSku: meta?.sku ?? row.supplierProductId,
          supplierVariantId: meta?.itemVariantId ?? null,
          supplierProductName: meta?.productName ?? null,
          supplierListedPriceCents: meta?.sourcePriceCents ?? null,
          supplierCurrency: meta?.currency ?? null,
          supplierVatMargin: meta?.isVatMargin ?? null,
          status: "TO_ORDER" as const,
        };
      }),
    )
    .onConflictDoNothing();
  return rows.length;
}

export type ProcurementRow = typeof orderItemProcurements.$inferSelect;

/** Tellimuse ridade hankekirjed (rea ID → kirje) */
export async function loadProcurements(db: Reader, orderItemIds: string[]): Promise<Map<string, ProcurementRow>> {
  if (!orderItemIds.length) return new Map();
  const rows = await db.select().from(orderItemProcurements).where(inArray(orderItemProcurements.orderItemId, orderItemIds)).orderBy(asc(orderItemProcurements.createdAt));
  return new Map(rows.map((row) => [row.orderItemId, row]));
}

import { z } from "zod";

/**
 * Tarnijalt käsitsi tellimine (hange) tellimuse rea kohta — nt Foxway. Automaatset tarnija tellimust, dropshippingut
 * ega tarnija kassat EI ole: admin tellib ise (võib enne erihinda küsida) ja märgib siin seisu.
 *
 *   TO_ORDER → ORDERED → SUPPLIER_SHIPPED → RECEIVED   (vajadusel saab samm tagasi parandada)
 *
 * Tarnija hinnakirja hind tellimuse hetkel (snapshot) ja TEGELIK ostuhind on eri väljad — tegelik võib erineda
 * (erihind). Seerianumber on valikuline (Foxway annab selle alles pärast tellimist).
 */
export const PROCUREMENT_STATUS_VALUES = ["TO_ORDER", "ORDERED", "SUPPLIER_SHIPPED", "RECEIVED"] as const;
export type ProcurementStatusValue = (typeof PROCUREMENT_STATUS_VALUES)[number];

export const PROCUREMENT_STATUS_LABELS: Record<ProcurementStatusValue, string> = {
  TO_ORDER: "Tellida tarnijalt",
  ORDERED: "Tarnijalt tellitud",
  SUPPLIER_SHIPPED: "Tarnija saatnud",
  RECEIVED: "Meieni jõudnud",
};

/** Foxway-spetsiifiline sõnastus adminis */
export function procurementStatusLabel(status: ProcurementStatusValue, supplier: string): string {
  if (supplier !== "foxway") return PROCUREMENT_STATUS_LABELS[status];
  return { TO_ORDER: "Tellida Foxwayst", ORDERED: "Foxwayst tellitud", SUPPLIER_SHIPPED: "Tarnija saatnud", RECEIVED: "Meieni jõudnud" }[status];
}

/** Tarnijad, kelle kaup tuleb tellimuse järel eraldi käsitsi tellida (hanke kirje luuakse tellimuse loomisel) */
export const PROCUREMENT_SUPPLIERS = ["foxway"] as const;

/** Seisu muutmisel täidetakse vastav kuupäev (kui see on tühi); tagasi liikudes hilisemad kuupäevad tühjendatakse. */
export function procurementDates(
  status: ProcurementStatusValue,
  current: { orderedAt: Date | null; supplierShippedAt: Date | null; receivedAt: Date | null },
  now: Date,
): { orderedAt: Date | null; supplierShippedAt: Date | null; receivedAt: Date | null } {
  const rank = PROCUREMENT_STATUS_VALUES.indexOf(status);
  return {
    orderedAt: rank >= 1 ? (current.orderedAt ?? now) : null,
    supplierShippedAt: rank >= 2 ? (current.supplierShippedAt ?? now) : null,
    receivedAt: rank >= 3 ? (current.receivedAt ?? now) : null,
  };
}

const emptyToNull = (value: unknown) => (typeof value === "string" && value.trim() === "" ? null : value);

export const procurementUpdateSchema = z.object({
  status: z.enum(PROCUREMENT_STATUS_VALUES),
  supplierOrderReference: z.preprocess(emptyToNull, z.string().trim().max(120).nullable()),
  note: z.preprocess(emptyToNull, z.string().trim().max(2000).nullable()),
  supplierSerial: z.preprocess(emptyToNull, z.string().trim().max(120).nullable()),
  /** "1234,50" → sendid; tühi → null (teadmata) */
  actualPurchasePriceCents: z.preprocess(
    (v) => {
      if (typeof v !== "string") return v;
      const cleaned = v.replace(/[€\s]/g, "").replace(",", ".");
      return cleaned === "" ? null : cleaned;
    },
    z.coerce.number({ error: "Vigane summa" }).min(0, "Summa ei saa olla negatiivne").max(100_000, "Liiga suur summa").transform((euros) => Math.round(euros * 100)).nullable(),
  ),
});
export type ProcurementUpdate = z.infer<typeof procurementUpdateSchema>;

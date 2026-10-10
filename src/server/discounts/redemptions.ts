import { and, count, eq, inArray } from "drizzle-orm";
import { buildDiscountSnapshot, type DiscountRule, type DiscountSuccess } from "@/domain/discounts/discount-engine";
import type { Database } from "@/server/db/client";
import { discountCodes, discountRedemptions } from "@/server/db/schema";

/**
 * Sooduskoodi KASUTUS (redemption) — valmis tellimuste süsteemi jaoks, praegu poes veel kasutamata.
 *
 * Koodi kontrollimine ostukorvis EI OLE kasutus. Kasutus tekib alles tellimusega:
 *
 *   tellimuse loomine   → reserveRedemption()  PENDING   (koht reserveeritakse; piirang kontrollitakse lukuga)
 *   makse kinnitatud    → confirmRedemption()  CONFIRMED (usage_count = kinnitatud kasutuste arv)
 *   tellimus tühistatud → cancelRedemption()   CANCELLED (koht vabaneb)
 *
 * Kõik funktsioonid töötavad välise tehingu sees (sama tehing, mis loob/muudab tellimuse).
 */

type Tx = Parameters<Parameters<Database["transaction"]>[0]>[0];

export class RedemptionError extends Error {
  constructor(
    public readonly code: "NOT_FOUND" | "USAGE_LIMIT_REACHED" | "INVALID_STATE",
    message: string,
  ) {
    super(message);
    this.name = "RedemptionError";
  }
}

/**
 * Reserveerib kasutuse tellimusele. Lukustab koodi rea (SELECT … FOR UPDATE), et kaks samaaegset
 * tellimust ei saaks viimast vaba kohta mõlemad kasutada. PENDING + CONFIRMED loetakse piirangusse.
 */
export async function reserveRedemption(tx: Tx, input: { discountCodeId: string; orderId: string; rule: DiscountRule; result: DiscountSuccess }) {
  const [code] = await tx.select().from(discountCodes).where(eq(discountCodes.id, input.discountCodeId)).for("update");
  if (!code) throw new RedemptionError("NOT_FOUND", "Sooduskoodi ei leitud");
  if (code.usageLimit !== null) {
    const [{ n }] = await tx
      .select({ n: count() })
      .from(discountRedemptions)
      .where(and(eq(discountRedemptions.discountCodeId, code.id), inArray(discountRedemptions.status, ["PENDING", "CONFIRMED"])));
    if (n >= code.usageLimit) throw new RedemptionError("USAGE_LIMIT_REACHED", "Sooduskoodi kasutuspiirang on täis");
  }
  const snapshot = buildDiscountSnapshot(input.rule, input.result);
  const [redemption] = await tx
    .insert(discountRedemptions)
    .values({
      discountCodeId: code.id,
      orderId: input.orderId,
      status: "PENDING",
      codeSnapshot: snapshot.code,
      typeSnapshot: snapshot.type,
      valueSnapshot: snapshot.value,
      discountAmountCents: snapshot.discountAmountApplied,
      snapshot,
    })
    .returning();
  return redemption;
}

async function syncUsageCount(tx: Tx, discountCodeId: string) {
  const [{ n }] = await tx
    .select({ n: count() })
    .from(discountRedemptions)
    .where(and(eq(discountRedemptions.discountCodeId, discountCodeId), eq(discountRedemptions.status, "CONFIRMED")));
  await tx.update(discountCodes).set({ usageCount: n }).where(eq(discountCodes.id, discountCodeId));
  return n;
}

/** Makse kinnitatud → kasutus loeb. usage_count arvutatakse kinnitatud kirjetest (mitte +1), seega on alati õige. */
export async function confirmRedemption(tx: Tx, redemptionId: string) {
  const [row] = await tx.select().from(discountRedemptions).where(eq(discountRedemptions.id, redemptionId)).for("update");
  if (!row) throw new RedemptionError("NOT_FOUND", "Kasutust ei leitud");
  if (row.status === "CONFIRMED") return syncUsageCount(tx, row.discountCodeId); // idempotentne (nt korduv makse webhook)
  if (row.status !== "PENDING") throw new RedemptionError("INVALID_STATE", `Kasutus on olekus ${row.status}`);
  await tx.update(discountRedemptions).set({ status: "CONFIRMED", confirmedAt: new Date() }).where(eq(discountRedemptions.id, redemptionId));
  return syncUsageCount(tx, row.discountCodeId);
}

export async function cancelRedemption(tx: Tx, redemptionId: string) {
  const [row] = await tx.select().from(discountRedemptions).where(eq(discountRedemptions.id, redemptionId)).for("update");
  if (!row) throw new RedemptionError("NOT_FOUND", "Kasutust ei leitud");
  if (row.status === "CANCELLED") return syncUsageCount(tx, row.discountCodeId);
  await tx.update(discountRedemptions).set({ status: "CANCELLED", cancelledAt: new Date() }).where(eq(discountRedemptions.id, redemptionId));
  return syncUsageCount(tx, row.discountCodeId);
}

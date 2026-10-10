import { and, count, eq, gte, lt } from "drizzle-orm";
import type { Database } from "@/server/db/client";
import { discountValidationAttempts } from "@/server/db/schema";

/**
 * Sooduskoodide äraarvamise piirang. Loetakse ainult EBAÕNNESTUNUD katseid (vale/aegunud kood jne):
 * tavaline klient, kes muudab ostukorvi kogust kehtiva koodiga, piirangusse ei jookse.
 * Andmebaasis, et töötaks ka mitme serverless-instantsi vahel.
 */
export const DISCOUNT_WINDOW_MS = 10 * 60 * 1000;
export const MAX_FAILED_DISCOUNT_ATTEMPTS = 10;

export async function isDiscountValidationBlocked(db: Database, ip: string, now = new Date()): Promise<boolean> {
  const [row] = await db
    .select({ n: count() })
    .from(discountValidationAttempts)
    .where(and(eq(discountValidationAttempts.ip, ip), eq(discountValidationAttempts.success, false), gte(discountValidationAttempts.createdAt, new Date(now.getTime() - DISCOUNT_WINDOW_MS))));
  return row.n >= MAX_FAILED_DISCOUNT_ATTEMPTS;
}

export async function recordDiscountFailure(db: Database, ip: string): Promise<void> {
  await db.insert(discountValidationAttempts).values({ ip, success: false });
  await db.delete(discountValidationAttempts).where(lt(discountValidationAttempts.createdAt, new Date(Date.now() - 24 * 60 * 60 * 1000)));
}

import "server-only";
import { and, asc, count, desc, eq, ilike, inArray, or, sql, type SQL } from "drizzle-orm";
import { EFFECTIVE_DISCOUNT_STATUSES, type EffectiveDiscountStatus } from "@/domain/discounts/discount-engine";
import { requireAdmin } from "@/server/auth/auth";
import { effectiveListing, effectiveModel } from "@/server/catalog/db-catalog-mapper";
import { getDb } from "@/server/db/client";
import { discountCodes, discountRedemptions, productModels, supplierListings } from "@/server/db/schema";
import { loadDiscountTargets } from "@/server/discounts/discount-repository";
import { ADMIN_PAGE_SIZE } from "../products/queries";

/**
 * Tegelik olek SQL-is andmebaasi kella järgi (sama loogika mis effectiveDiscountStatus domeenis):
 * ACTIVE + möödunud lõpp = EXPIRED, ACTIVE + tulevane algus = SCHEDULED.
 */
export const effectiveStatusSql = sql<EffectiveDiscountStatus>`(CASE
  WHEN ${discountCodes.status} <> 'ACTIVE' THEN ${discountCodes.status}
  WHEN ${discountCodes.expiresAt} IS NOT NULL AND ${discountCodes.expiresAt} <= now() THEN 'EXPIRED'
  WHEN ${discountCodes.startsAt} IS NOT NULL AND ${discountCodes.startsAt} > now() THEN 'SCHEDULED'
  ELSE 'ACTIVE' END)`;

export interface DiscountListFilters {
  q?: string;
  status?: EffectiveDiscountStatus;
  type?: string;
  sort?: "updated" | "code" | "expires" | "created";
  page: number;
}

export async function listDiscounts(filters: DiscountListFilters) {
  await requireAdmin();
  const db = getDb();
  const conditions: SQL[] = [];
  if (filters.q) {
    const like = `%${filters.q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
    conditions.push(or(ilike(discountCodes.normalizedCode, like), ilike(discountCodes.name, like))!);
  }
  if (filters.status) conditions.push(sql`${effectiveStatusSql} = ${filters.status}`);
  if (filters.type) conditions.push(eq(discountCodes.type, filters.type as "PERCENTAGE"));
  const where = conditions.length ? and(...conditions) : undefined;
  const order = {
    updated: [desc(discountCodes.updatedAt)],
    created: [desc(discountCodes.createdAt)],
    code: [asc(discountCodes.normalizedCode)],
    expires: [sql`${discountCodes.expiresAt} ASC NULLS LAST`],
  }[filters.sort ?? "updated"];

  const [rows, [{ total }]] = await Promise.all([
    db
      .select({ discount: discountCodes, effectiveStatus: effectiveStatusSql })
      .from(discountCodes)
      .where(where)
      .orderBy(...order, asc(discountCodes.normalizedCode))
      .limit(ADMIN_PAGE_SIZE)
      .offset((filters.page - 1) * ADMIN_PAGE_SIZE),
    db.select({ total: count() }).from(discountCodes).where(where),
  ]);
  return { rows, total, pageCount: Math.max(1, Math.ceil(total / ADMIN_PAGE_SIZE)) };
}

export async function getDiscountDetail(id: string) {
  await requireAdmin();
  const db = getDb();
  const [row] = await db.select({ discount: discountCodes, effectiveStatus: effectiveStatusSql }).from(discountCodes).where(eq(discountCodes.id, id)).limit(1);
  if (!row) return null;
  const [targets, [redemptions]] = await Promise.all([
    loadDiscountTargets(db, id),
    db
      .select({ pending: sql<number>`count(*) FILTER (WHERE ${discountRedemptions.status} = 'PENDING')::int`, confirmed: sql<number>`count(*) FILTER (WHERE ${discountRedemptions.status} = 'CONFIRMED')::int` })
      .from(discountRedemptions)
      .where(eq(discountRedemptions.discountCodeId, id)),
  ]);
  return { ...row, targets, redemptions };
}

/** Valikud vormi jaoks (mudelid ja konfiguratsioonid, efektiivsete väärtustega). */
export async function getDiscountTargetOptions() {
  await requireAdmin();
  const db = getDb();
  const [models, listings] = await Promise.all([
    db.select().from(productModels).orderBy(asc(productModels.manufacturer), asc(productModels.family), asc(productModels.model)),
    db.select({ listing: supplierListings, family: productModels.family, model: productModels.model }).from(supplierListings).innerJoin(productModels, eq(productModels.id, supplierListings.productModelId)).orderBy(asc(supplierListings.sku)),
  ]);
  return {
    models: models.map((row) => {
      const m = effectiveModel(row);
      return { id: m.id, label: `${m.family} ${m.model}`, hint: m.manufacturer };
    }),
    listings: listings.map(({ listing, family, model }) => {
      const l = effectiveListing(listing);
      const spec = [l.cpu, l.ramGb ? `${l.ramGb} GB` : null, l.storageGb ? `${l.storageGb} GB SSD` : null, l.grade].filter(Boolean).join(" · ");
      return { id: l.id, label: `${l.sku} — ${family} ${model}`, hint: spec, priceCents: l.salePriceCents };
    }),
  };
}

/** Töölaua kokkuvõte: koodide arv tegeliku oleku järgi. */
export async function getDiscountStatusCounts(): Promise<Record<EffectiveDiscountStatus, number>> {
  await requireAdmin();
  const rows = await getDb().select({ status: effectiveStatusSql, n: count() }).from(discountCodes).groupBy(effectiveStatusSql);
  const result = Object.fromEntries(EFFECTIVE_DISCOUNT_STATUSES.map((s) => [s, 0])) as Record<EffectiveDiscountStatus, number>;
  for (const row of rows) result[row.status] = row.n;
  return result;
}

export async function getModelLabels(ids: string[]) {
  if (!ids.length) return [];
  return getDb().select({ id: productModels.id, family: productModels.family, model: productModels.model }).from(productModels).where(inArray(productModels.id, ids));
}

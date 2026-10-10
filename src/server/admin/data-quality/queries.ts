import "server-only";
import { count } from "drizzle-orm";
import { LISTING_ISSUES, MODEL_ISSUES, type ListingIssue, type ModelIssue } from "@/domain/admin/data-quality-rules";
import { requireAdmin } from "@/server/auth/auth";
import { getDb } from "@/server/db/client";
import { productModels, supplierListings } from "@/server/db/schema";
import { listingIssueCondition, modelIssueCondition } from "../products/queries";

export interface IssueCount<K extends string> {
  key: K;
  label: string;
  description: string;
  count: number;
}

/** Andmekvaliteedi ülevaade: iga kontrolli kohta probleemsete kirjete arv (efektiivsete väärtuste järgi). */
export async function getDataQualityCounts() {
  await requireAdmin();
  const db = getDb();
  const [modelTotal] = await db.select({ n: count() }).from(productModels);
  const [listingTotal] = await db.select({ n: count() }).from(supplierListings);

  const models = await Promise.all(
    (Object.keys(MODEL_ISSUES) as ModelIssue[]).map(async (key): Promise<IssueCount<ModelIssue>> => {
      const [row] = await db.select({ n: count() }).from(productModels).where(modelIssueCondition(key));
      return { key, ...MODEL_ISSUES[key], count: row.n };
    }),
  );
  const listings = await Promise.all(
    (Object.keys(LISTING_ISSUES) as ListingIssue[]).map(async (key): Promise<IssueCount<ListingIssue>> => {
      const [row] = await db.select({ n: count() }).from(supplierListings).where(listingIssueCondition(key));
      return { key, ...LISTING_ISSUES[key], count: row.n };
    }),
  );
  return { modelTotal: modelTotal.n, listingTotal: listingTotal.n, models, listings };
}

"use server";

import { z } from "zod";
import { BUDGETS, CARRY_OPTIONS, PRIORITIES, PURPOSES, recommendLaptops, type FinderResult } from "@/domain/finder/finder";
import { getAllItems } from "@/server/catalog/catalog-service";

/**
 * Laptop finderi tulemused arvutatakse serveris (kogu kataloogi ei saadeta brauserisse).
 * Sisend valideeritakse.
 */
const answersSchema = z.object({
  purpose: z.enum(PURPOSES.map((p) => p.key) as [string, ...string[]]),
  budget: z.enum(BUDGETS.map((b) => b.key) as [string, ...string[]]),
  carry: z.enum(CARRY_OPTIONS.map((c) => c.key) as [string, ...string[]]),
  priorities: z.array(z.enum(PRIORITIES.map((p) => p.key) as [string, ...string[]])).max(PRIORITIES.length),
});

export async function findLaptops(input: unknown): Promise<FinderResult | null> {
  const parsed = answersSchema.safeParse(input);
  if (!parsed.success) return null;
  return recommendLaptops(await getAllItems(), parsed.data as Parameters<typeof recommendLaptops>[1]);
}

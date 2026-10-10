/**
 * Töötleb elemente paralleelselt, aga mitte rohkem kui `limit` korraga
 * (nt 2–5 Icecati päringut korraga, mitte sadu).
 * Tulemuste järjekord vastab sisendi järjekorrale.
 */
export async function mapWithConcurrency<T, R>(items: T[], limit: number, worker: (item: T, index: number) => Promise<R>): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  const runners = Array.from({ length: Math.min(Math.max(1, limit), items.length) }, async () => {
    while (next < items.length) {
      const index = next++;
      results[index] = await worker(items[index], index);
    }
  });
  await Promise.all(runners);
  return results;
}

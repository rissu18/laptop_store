/**
 * Kataloogi lugemistee mõõtmine ja vastavuskontroll (ainult lugemine): npm run perf:bench [-- --verify]
 *
 *  - mõõdab SQL-päringute aega (esimene = külm ühendus, ülejäänud soojad), tagastatavate ridade arvu ja mahtu;
 *  - --verify: võrdleb SQL-i filtreid, tahte, sorteerimist ja lehekülgi varasema mälus filtreerimisega
 *    (domain/catalog/filtering.ts) päris andmetel — iga filtri väärtus, kombinatsioonid, otsingud, sorteeringud.
 * Väljund on JSON; saladusi ega ühendusi ei logita.
 */
import "./lib/load-env";
import { isDeepStrictEqual } from "node:util";
import { performance } from "node:perf_hooks";
import { cpuFilterFamily, cpuFilterGeneration, cpuGenerationRank } from "@/domain/catalog/cpu-filter";
import { MULTI_FACET_KEYS, seriesFilterValue } from "@/domain/catalog/facets";
import { computeFacets, filterItems, sortItems, type SearchableItem } from "@/domain/catalog/filtering";
import { PAGE_SIZE, SORT_OPTIONS, parseCatalogQuery, type CatalogQuery, type RawSearchParams } from "@/domain/catalog/query";
import { getDb } from "@/server/db/client";
import { redactConnectionStrings } from "@/server/db/database-url";
import { queryCatalogPage, queryProductDetail, querySimilarItems, queryStorefrontKeysForVerify } from "@/server/catalog/catalog-queries";
import { findSimilarItems } from "@/domain/catalog/similar";
import { queryStorefrontCatalogRows } from "@/server/catalog/db-catalog";
import { mapCatalogRows } from "@/server/catalog/db-catalog-mapper";

const RUNS = Number(process.env.RUNS ?? 5);
const bytes = (value: unknown) => Buffer.byteLength(JSON.stringify(value));

async function series<T>(label: string, fn: () => Promise<T>, size: (value: T) => Record<string, number>) {
  const runs: number[] = [];
  let last: T | undefined;
  for (let i = 0; i < RUNS; i++) {
    const start = performance.now();
    last = await fn();
    runs.push(Math.round((performance.now() - start) * 10) / 10);
  }
  const warm = runs.slice(1).sort((a, b) => a - b);
  console.log(JSON.stringify({ label, firstMs: runs[0], warmMedianMs: warm[Math.floor(warm.length / 2)] ?? runs[0], ...size(last as T) }));
}

function oldPage(all: SearchableItem[], query: CatalogQuery) {
  const matching = sortItems(filterItems(all, query), query.sort);
  const pageCount = Math.max(1, Math.ceil(matching.length / PAGE_SIZE));
  const page = Math.min(query.page, pageCount);
  return { ids: matching.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE).map((i) => i.variant.id), total: matching.length, page, pageCount, facets: computeFacets(all, query) };
}

async function verify() {
  const db = getDb();
  const rows = await queryStorefrontCatalogRows(db);
  const { items: all } = mapCatalogRows(rows.models, rows.listings, rows.images, rows.unitImages);
  const failures: unknown[] = [];

  // 1. Filtri võtmed ja otsingutekst pakkumise kaupa
  const keys = new Map((await queryStorefrontKeysForVerify(db)).map((row) => [row.sku, row]));
  if (keys.size !== all.length) failures.push({ check: "count", sql: keys.size, js: all.length });
  for (const item of all) {
    const row = keys.get(item.variant.sku);
    const js = {
      series: seriesFilterValue(item.product),
      cpu_family: cpuFilterFamily(item.variant.cpu),
      cpu_gen: cpuFilterGeneration(item.variant.cpu),
      search_doc: item.searchText,
      gen_rank: cpuGenerationRank(cpuFilterGeneration(item.variant.cpu)),
    };
    const sqlKeys = row && { series: row.series, cpu_family: row.cpu_family, cpu_gen: row.cpu_gen, search_doc: row.search_doc, gen_rank: row.gen_rank };
    if (!isDeepStrictEqual(js, sqlKeys)) failures.push({ check: "keys", sku: item.variant.sku, js, sql: sqlKeys });
  }

  // 2. Päringud: iga tahu iga väärtus, kombinatsioonid, otsingud, hinnad, omadused, sorteeringud ja leheküljed
  const base = computeFacets(all, parseCatalogQuery({}));
  const params: RawSearchParams[] = [{}];
  for (const key of MULTI_FACET_KEYS) for (const option of base.multi[key]) params.push({ [key]: option.value });
  for (const option of base.features) params.push({ f: option.value });
  params.push(
    { series: "thinkpad" },
    { brand: "lenovo", series: "thinkpad,thinkpad-t" },
    { brand: "lenovo", ram: "16", screen: "14", grade: "a,b" },
    { brand: "dell,hp", ram: "16,32", ssd: "512" },
    { cpu: "intel-core-i5,intel-core-i7", gen: "intel-11,intel-12" },
    { min: "300", max: "700" },
    { min: "500", brand: "lenovo", f: "touch" },
    { q: "t14 g4" }, { q: "T14 Gen 4" }, { q: "x1 carbon gen 10" }, { q: "x1 carbon g10" }, { q: "16gb 512" }, { q: "uus" }, { q: "i5-1235u" }, { q: "elitebook 840 g8" }, { q: "zzzz" },
    { page: "2" }, { page: "999" }, { brand: "lenovo", page: "3" },
  );
  for (const sort of SORT_OPTIONS) params.push({ sort: sort.key }, { sort: sort.key, page: "2", brand: "lenovo" });

  for (const raw of params) {
    const query = parseCatalogQuery(raw);
    const expected = oldPage(all, query);
    const actual = await queryCatalogPage(db, query);
    const got = { ids: actual.items.map((i) => i.variant.id), total: actual.total, page: actual.page, pageCount: actual.pageCount, facets: actual.facets };
    for (const field of ["total", "page", "pageCount", "ids", "facets"] as const) {
      if (!isDeepStrictEqual(expected[field], got[field])) failures.push({ check: `query.${field}`, raw, expected: field === "facets" ? "(vt diff)" : expected[field], got: field === "facets" ? diffFacets(expected.facets, got.facets) : got[field] });
    }
  }
  // 3. Kaardi andmed: SQL-i lehe kirjed = täiskataloogi kirjed (sama mapper)
  const page = await queryCatalogPage(db, parseCatalogQuery({ sort: "price-asc" }));
  const byId = new Map(all.map((item) => [item.variant.id, { product: item.product, variant: item.variant }]));
  for (const item of page.items) if (!isDeepStrictEqual(item, byId.get(item.variant.id))) failures.push({ check: "item", id: item.variant.id });

  // 4. Sarnased tooted: SQL-i eelvalik + punktid = varasem täiskataloogi arvutus (iga 10. pakkumine)
  const publicAll = all.map((item) => ({ product: item.product, variant: item.variant }));
  for (const current of publicAll.filter((_, i) => i % 10 === 0)) {
    const expected = findSimilarItems(current, publicAll, 4).map((i) => i.variant.id);
    const got = (await querySimilarItems(db, current, 4)).map((i) => i.variant.id);
    if (!isDeepStrictEqual(expected, got)) failures.push({ check: "similar", id: current.variant.id, expected, got });
  }

  console.log(JSON.stringify({ verify: failures.length === 0 ? "OK" : "FAILED", queries: params.length, listings: all.length, failures: failures.slice(0, 15), failureCount: failures.length }, null, 1));
  if (failures.length) process.exitCode = 1;
}

function diffFacets(a: ReturnType<typeof computeFacets>, b: ReturnType<typeof computeFacets>) {
  const out: Record<string, unknown> = {};
  for (const key of MULTI_FACET_KEYS) if (!isDeepStrictEqual(a.multi[key], b.multi[key])) out[key] = { js: a.multi[key], sql: b.multi[key] };
  if (!isDeepStrictEqual(a.features, b.features)) out.features = { js: a.features, sql: b.features };
  if (!isDeepStrictEqual(a.price, b.price)) out.price = { js: a.price, sql: b.price };
  return out;
}

async function bench() {
  const db = getDb();
  const queries: Record<string, RawSearchParams> = {
    all: {},
    filter: { brand: "lenovo", ram: "16", screen: "14", grade: "a,b" },
    search: { q: "t14 g4" },
    page3: { sort: "price-asc", page: "3" },
  };
  for (const [name, raw] of Object.entries(queries)) {
    await series(`catalogPage:${name}`, () => queryCatalogPage(db, parseCatalogQuery(raw)), (page) => ({ items: page.items.length, total: page.total, itemsBytes: bytes(page.items), facetsBytes: bytes(page.facets) }));
  }
  const slug = process.env.SLUG ?? "lenovo-thinkpad-t14-gen-4";
  await series(`productDetail:${slug}`, () => queryProductDetail(db, slug), (data) => ({ variants: data?.variants.length ?? 0, bytes: bytes(data) }));
}

(process.argv.includes("--verify") ? verify() : bench())
  .catch((error) => {
    console.error("VIGA:", redactConnectionStrings(error instanceof Error ? (error.stack ?? error.message) : String(error)));
    process.exitCode = 1;
  })
  .finally(() => setTimeout(() => process.exit(), 50));

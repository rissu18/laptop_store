import "server-only";
import { and, asc, eq, inArray, isNull, or, sql, type SQL } from "drizzle-orm";
import { sortConfigurations } from "@/domain/catalog/configuration-order";
import { GENERIC_INTEGRATED_GPU } from "@/domain/catalog/enrichment";
import { FACETS, IN_STORE_DELIVERY, MULTI_FACET_KEYS, SUPPLIER_FILTER_LABELS, type MultiFacetKey } from "@/domain/catalog/facets";
import { FEATURE_LABELS, FEATURE_ORDER } from "@/domain/catalog/features";
import type { CatalogFacets, FacetOption } from "@/domain/catalog/filtering";
import { PAGE_SIZE, type CatalogQuery, type FacetSelection, type SortKey } from "@/domain/catalog/query";
import { tokenize } from "@/domain/catalog/search";
import { SIMILAR_PRICE_TOLERANCE, findSimilarItems, type SimilarityItem } from "@/domain/catalog/similar";
import { BRAND_CODES, BRAND_NAMES, FEATURE_KEYS, type BrandCode, type CatalogItem, type CpuFamily, type FeatureKey } from "@/domain/catalog/types";
import { GRADES, GRADE_CODES } from "@/domain/grade/grades";
import type { Database } from "@/server/db/client";
import { listingImages, productImages, productModels, supplierListings } from "@/server/db/schema";
import { pickColumns } from "./db-catalog";
import {
  STOREFRONT_IMAGE_COLUMNS,
  STOREFRONT_LISTING_COLUMNS,
  STOREFRONT_LISTING_IMAGE_COLUMNS,
  STOREFRONT_MODEL_COLUMNS,
  mapCatalogRows,
} from "./db-catalog-mapper";

/**
 * Poe kataloogi päringud PostgreSQL-is (jõudluse sprint 2026-10-12, vt docs/ARCHITECTURE.md → Kataloogi päringud).
 *
 * Põhimõte (sama mis Laptopid.ee vanas filtris, aga parameetritega SQL-iga):
 *   1. filtrid, tahud (facet'ide loendurid), sorteerimine ja LIMIT/OFFSET toimuvad andmebaasis kitsa
 *      projektsiooni peal (`storefront` CTE) — kogu kataloogi ei materialiseerita ega saadeta kuhugi;
 *   2. alles seejärel loetakse kaardi/tootelehe andmed ja pildid AINULT leitud pakkumiste mudelite kohta
 *      (`hydrateModels`) ja teisendatakse sama mapperiga (mapCatalogRows) nagu varem — efektiivsed väärtused
 *      (admini parandus ?? tarnija), saadavus ja piltide järjekord jäävad identseks.
 *
 * `storefront` CTE kordab SQL-is domeenireegleid (domain/catalog/*): efektiivsed väärtused `manual_overrides`
 * JSONB-st, saadavus (availability.ts → resolveStock), kohustuslikud väljad (missingStorefrontFields), filtri
 * väärtused (facets.ts: bucket'id, ThinkPadi alamseeria, cpu-filter.ts: CPU perekond/põlvkond nimest) ja
 * otsingutekst (search.ts → buildSearchText). Vastavust kontrollib `npm run perf:bench -- --verify` päris
 * andmetel ja catalog-queries.db.test.ts testskeemis. Kõik kasutaja sisendid on SQL-parameetrid; `sql.raw`
 * saab ainult koodis olevaid konstante.
 */

type Db = Pick<Database, "select" | "selectDistinct" | "execute">;

// ---- Konstandid SQL-i jaoks (ainult koodist, mitte kasutajalt) ---------------------------------------------

const literal = (value: string) => {
  if (!/^[A-Za-z0-9 +._-]*$/.test(value)) throw new Error(`Lubamatu SQL konstant: ${value}`);
  return `'${value}'`;
};
const literalList = (values: readonly string[]) => values.map(literal).join(", ");

/** Efektiivne väärtus: admini parandus (`manual_overrides` võti olemas) ?? tarnija veerg. */
const eff = (alias: "l" | "m", key: string, column: string, cast = "text") =>
  `(CASE WHEN ${alias}.manual_overrides ? ${literal(key)} THEN (${alias}.manual_overrides->>${literal(key)})::${cast} ELSE ${alias}.${column}::${cast} END)`;

const BRAND_NAME_SQL = `(CASE e.brand ${BRAND_CODES.map((code) => `WHEN ${literal(code)} THEN ${literal(BRAND_NAMES[code])}`).join(" ")} END)`;
const GRADE_PARAM_SQL = `(CASE e.grade ${GRADE_CODES.map((code) => `WHEN ${literal(code)} THEN ${literal(GRADES[code].param)}`).join(" ")} END)`;
const THINKPAD_PARENT_LINES = ["thinkpad-t", "thinkpad-x", "thinkpad-x1", "thinkpad-x13", "thinkpad-l", "thinkpad-e"];

/** search.ts → normalizeSearchText (diakriitikud: levinumad tähed; ülejäänud muutuvad eraldajaks) */
const normalize = (expr: string) =>
  `btrim(regexp_replace(translate(lower(${expr}), 'äöüõšžéèêëáàâåíìîóòôúùûñç', 'aouoszeeeeaaaaiiiooouuunc'), '[^a-z0-9.+]+', ' ', 'g'))`;

/**
 * Poe nähtavad pakkumised koos efektiivsete väärtuste ja filtri võtmetega. `scope` piirab baasridu (nt üks mudel).
 * Regulaaravaldised = cpu-filter.ts / facets.ts / display-name.ts (PostgreSQL-is \y = sõnapiir, JS-is \b).
 */
const STOREFRONT_CTE = String.raw`
storefront_base AS (
  SELECT
    l.id, l.product_model_id AS model_id, l.sku, l.first_seen_at, m.featured, lower(l.supplier) AS supplier,
    ${eff("m", "manufacturer", "manufacturer")} AS brand,
    ${eff("m", "family", "family")} AS family,
    ${eff("m", "model", "model")} AS model,
    COALESCE(${eff("m", "screenSizeIn", "screen_size_in", "numeric")}, ${eff("l", "screenSizeIn", "screen_size_in", "numeric")}) AS screen,
    ${eff("l", "cpu", "cpu")} AS cpu,
    ${eff("l", "cpuFamily", "cpu_family")} AS cpu_family_db,
    ${eff("l", "cpuGeneration", "cpu_generation")} AS cpu_gen_db,
    ${eff("l", "ramGb", "ram_gb", "numeric")} AS ram,
    ${eff("l", "storageGb", "storage_gb", "numeric")} AS storage,
    ${eff("l", "grade", "grade")} AS grade,
    ${eff("l", "keyboard", "keyboard")} AS kb,
    COALESCE(${eff("l", "gpu", "gpu")}, l.enrichment->'gpu'->>'value') AS gpu,
    ${eff("l", "gpuDedicated", "gpu_dedicated", "boolean")} AS gpu_dedicated,
    ${eff("l", "stock", "stock", "numeric")} AS stock,
    l.available,
    ${eff("l", "deliveryMinDays", "delivery_min_days", "int")} AS delivery_min,
    ${eff("l", "deliveryMaxDays", "delivery_max_days", "int")} AS delivery_max,
    -- Kliendi hind täiseurodes (sama reegel mis money.ts → roundToEuro): filter, sortimine ja hinnavahemik = kuvatav hind
    ROUND((CASE WHEN l.price_source = 'SUPPLIER' AND l.manual_overrides ? 'salePriceCents'
      THEN (l.manual_overrides->>'salePriceCents')::numeric ELSE l.sale_price_cents::numeric END) / 100) * 100 AS price,
    l.features || jsonb_build_object('touch', ${eff("l", "touchscreen", "touchscreen", "boolean")}) AS feat
  FROM supplier_listings l
  JOIN product_models m ON m.id = l.product_model_id
  WHERE l.status = 'ACTIVE' AND m.status = 'ACTIVE' AND l.available IS NOT FALSE
    -- tarnija kvaliteedi kinnipidamine (Foxway rike / ülevaatus); admin võib parandusega avaldada (db-catalog-mapper.ts)
    AND ${eff("l", "qualityHold", "quality_hold")} IS NULL
),
storefront_eligible AS (
  SELECT b.*,
    CASE WHEN b.brand = 'lenovo' THEN regexp_replace(b.model, '\yGen\s*(\d{1,2})\y', 'G\1', 'g') ELSE b.model END AS display_model,
    regexp_replace(b.cpu, '\s+', ' ', 'g') AS cpu_text,
    btrim(regexp_replace(regexp_replace(lower(b.family), '[^a-z0-9]+', '-', 'g'), '(^-|-$)', '', 'g')) AS family_slug
  FROM storefront_base b
  WHERE ((b.stock IS NOT NULL AND b.stock > 0) OR (b.stock IS NULL AND b.available IS TRUE))
    AND b.cpu <> '' AND b.ram <> 0 AND b.storage <> 0 AND b.price > 0 AND b.screen <> 0
    AND b.grade IN (${literalList(GRADE_CODES)})
    AND b.brand IN (${literalList(BRAND_CODES)})
),
storefront_cpu AS (
  SELECT e.*,
    regexp_match(e.cpu_text, '\yApple\s+M(\d{1,2})(?:\s+(Pro|Max|Ultra))?\y', 'i') AS rx_apple,
    regexp_match(e.cpu_text, '\yCore\s*Ultra\s*([579])\s*(\d)\d{2}[a-z]*', 'i') AS rx_ultra,
    regexp_match(e.cpu_text, '\yi([3579])[-\s]?(\d{4,5})[a-z0-9]*', 'i') AS rx_core,
    regexp_match(e.cpu_text, '\yAMD\s+(?:Ryzen\s+)?AI\s*([579])\s*(?:PRO\s*)?(\d)\d{2}\y', 'i') AS rx_ai,
    regexp_match(e.cpu_text, '\yRyzen\s*([3579])\s*(?:PRO\s*)?(\d)\d{3}[a-z]*', 'i') AS rx_ryzen,
    e.cpu_text ~* '\ySnapdragon\s+X\y' AS rx_snapdragon
  FROM storefront_eligible e
),
storefront_keys AS (
  SELECT e.*,
    CASE
      WHEN e.cpu_family_db <> '' THEN e.cpu_family_db
      WHEN e.rx_apple IS NOT NULL THEN 'apple-m' || e.rx_apple[1] || COALESCE('-' || lower(e.rx_apple[2]), '')
      WHEN e.rx_ultra IS NOT NULL THEN 'intel-core-ultra-' || e.rx_ultra[1]
      WHEN e.rx_core IS NOT NULL THEN 'intel-core-i' || e.rx_core[1]
      WHEN e.rx_ai IS NOT NULL THEN 'amd-ryzen-ai-' || e.rx_ai[1]
      WHEN e.rx_ryzen IS NOT NULL THEN 'amd-ryzen-' || e.rx_ryzen[1]
      WHEN e.rx_snapdragon THEN 'qualcomm-snapdragon-x'
    END AS cpu_family,
    CASE
      WHEN e.cpu_gen_db <> '' THEN e.cpu_gen_db
      WHEN e.rx_apple IS NOT NULL THEN 'apple-' || e.rx_apple[1]
      WHEN e.rx_ultra IS NOT NULL THEN 'ultra-' || e.rx_ultra[2]
      WHEN e.rx_core IS NOT NULL THEN 'intel-' || (CASE WHEN left(e.rx_core[2], 1) = '1' THEN left(e.rx_core[2], 2)::int ELSE left(e.rx_core[2], 1)::int END)
      WHEN e.rx_ai IS NOT NULL THEN 'amdai-' || e.rx_ai[2] || '00'
      WHEN e.rx_ryzen IS NOT NULL THEN 'amd-' || e.rx_ryzen[2] || '000'
    END AS cpu_gen,
    CASE
      WHEN e.brand = 'lenovo' AND e.family_slug IN ('thinkpad', 'thinkpad-p') THEN
        CASE
          WHEN btrim(e.display_model) ~* '^X1(?!\d)' THEN 'thinkpad-x1'
          WHEN btrim(e.display_model) ~* '^X13(?!\d)' THEN 'thinkpad-x13'
          WHEN btrim(e.display_model) ~* '^X\d' THEN 'thinkpad-x'
          WHEN btrim(e.display_model) ~* '^T\d' THEN 'thinkpad-t'
          WHEN btrim(e.display_model) ~* '^L\d' THEN 'thinkpad-l'
          WHEN btrim(e.display_model) ~* '^E\d' THEN 'thinkpad-e'
          WHEN btrim(e.display_model) ~* '^P\d' THEN 'thinkpad-p'
          ELSE e.family_slug
        END
      ELSE e.family_slug
    END AS series
  FROM storefront_cpu e
),
storefront AS (
  SELECT e.id, e.model_id, e.sku, e.first_seen_at, e.featured, e.brand,
    -- facets.ts → supplierFilterValue (tundmatu tarnija filtris ei osale)
    CASE WHEN e.supplier IN (${literalList(Object.keys(SUPPLIER_FILTER_LABELS))}) THEN e.supplier END AS supplier_v,
    -- facets.ts → deliveryFilterValue: tarnija tarneaeg "1-2"; muidu kogus teadmata (saadaval) = salongis "kohapeal"
    CASE WHEN e.delivery_min IS NOT NULL AND e.delivery_max IS NOT NULL THEN e.delivery_min || '-' || e.delivery_max
      WHEN e.stock IS NULL THEN ${literal(IN_STORE_DELIVERY)} END AS delivery_v, e.family, e.display_model, e.screen, e.cpu,
    e.cpu_family_db, e.ram, e.storage, e.grade, e.gpu, e.gpu_dedicated, e.stock, e.price, e.feat, e.cpu_family, e.cpu_gen, e.series,
    CASE WHEN e.series IN (${literalList(THINKPAD_PARENT_LINES)}) THEN 'thinkpad' END AS series_parent,
    ${GRADE_PARAM_SQL} AS grade_param,
    (array_position(ARRAY[${literalList(GRADE_CODES)}], e.grade) - 1) AS grade_rank,
    least(17, greatest(13, floor(e.screen)))::int::text AS screen_b,
    CASE WHEN e.ram >= 64 THEN '64' WHEN e.ram >= 32 THEN '32' WHEN e.ram >= 16 THEN '16' ELSE '8' END AS ram_b,
    CASE WHEN e.storage >= 2048 THEN '2048' WHEN e.storage >= 1024 THEN '1024' WHEN e.storage >= 512 THEN '512' ELSE '256' END AS ssd_b,
    -- keyboard.ts → keyboardFilterValue (kõik tarnijad, ka tundmatu kood toorkujul)
    CASE WHEN e.kb ~ '^[A-Za-z0-9][A-Za-z0-9/ -]{1,19}$' THEN btrim(regexp_replace(lower(e.kb), '[^a-z0-9]+', '-', 'g'), '-') END AS kb_v,
    COALESCE((
      SELECT CASE split_part(e.cpu_gen, '-', 1)
        WHEN 'intel' THEN g.v WHEN 'ultra' THEN 13 + g.v WHEN 'amd' THEN 6 + g.v / 1000
        WHEN 'amdai' THEN 15 WHEN 'apple' THEN 10 + g.v WHEN 'core' THEN 12 + g.v WHEN 'snapdragon' THEN 15 ELSE 0 END
      FROM (SELECT CASE WHEN split_part(e.cpu_gen, '-', 2) ~ '^\d+$' THEN split_part(e.cpu_gen, '-', 2)::numeric END AS v) g
    ), 0) AS gen_rank,
    ${normalize(String.raw`concat_ws(' ',
      ${BRAND_NAME_SQL}, e.family, e.display_model,
      regexp_replace(e.display_model, '\yGen (\d+)\y', 'G\1', 'gi'),
      CASE WHEN e.brand = 'lenovo' THEN regexp_replace(e.display_model, '\yG(\d{1,2})\y', 'Gen \1', 'g') ELSE '' END,
      e.cpu, regexp_replace(e.cpu, '^.*?-', ''),
      trim_scale(e.ram)::text || 'gb', trim_scale(e.ram)::text || ' gb ram',
      CASE WHEN e.storage >= 1024 THEN trim_scale(e.storage / 1024)::text || 'tb' ELSE trim_scale(e.storage)::text || 'gb' END,
      trim_scale(e.storage)::text || 'gb ssd',
      trim_scale(e.screen)::text || '"',
      -- enrichment.ts → displayGpu: tühi GPU + gpu_dedicated = false → "Integreeritud graafika"
      CASE WHEN btrim(COALESCE(e.gpu, '')) <> '' THEN e.gpu WHEN e.gpu_dedicated IS FALSE THEN ${literal(GENERIC_INTEGRATED_GPU)} ELSE '' END,
      e.sku, 'grade ' || e.grade,
      CASE WHEN e.grade = 'NEW' THEN 'uus' ELSE '' END)`)} AS search_doc
  FROM storefront_keys e
)`;

/** WITH storefront AS (...) <body> */
const withStorefront = (body: SQL) => sql`WITH ${sql.raw(STOREFRONT_CTE)} ${body}`;

// ---- Filtrid ----------------------------------------------------------------------------------------------

/** Filtri tahu SQL veerg (URL-i väärtuste kujul) — vt facets.ts → valuesOf. */
const FACET_COLUMN: Record<MultiFacetKey, string> = {
  delivery: "delivery_v",
  supplier: "supplier_v",
  brand: "brand",
  series: "series",
  grade: "grade_param",
  screen: "screen_b",
  ram: "ram_b",
  ssd: "ssd_b",
  cpu: "cpu_family",
  gen: "cpu_gen",
  kb: "kb_v",
};

const inList = (column: string, values: string[]) => sql`${sql.raw(column)} IN (${sql.join(values.map((v) => sql`${v}`), sql`, `)})`;

const featureTrue = (feature: FeatureKey | SQL) => sql`feat -> ${feature} = 'true'::jsonb`;

type Exclude = { facet?: MultiFacetKey; feature?: true; price?: true };

/** Kõik aktiivsed filtrid AND-iga (sama tahu sees OR). `exclude` = tahu loenduri jaoks välja jäetav filter. */
function whereClause(query: CatalogQuery, exclude: Exclude = {}): SQL {
  const parts: SQL[] = [sql`TRUE`];
  for (const token of tokenize(query.q)) parts.push(sql`(' ' || search_doc) LIKE ${`% ${token}%`}`);
  for (const key of MULTI_FACET_KEYS) {
    const selected = query.facets[key];
    if (key === exclude.facet || selected.length === 0) continue;
    // "thinkpad" vastab ka alamseeriatele (facets.ts → matchValuesOf)
    parts.push(key === "series" ? sql`(${inList("series", selected)} OR ${inList("series_parent", selected)})` : inList(FACET_COLUMN[key], selected));
  }
  if (!exclude.feature) for (const feature of query.features) parts.push(featureTrue(feature));
  if (!exclude.price) {
    if (query.minPrice !== null) parts.push(sql`price >= ${query.minPrice * 100}`);
    if (query.maxPrice !== null) parts.push(sql`price <= ${query.maxPrice * 100}`);
  }
  return sql.join(parts, sql` AND `);
}

/** Omaduse loendur: kõik filtrid, v.a sama omadus (rea omadus `f.key`). */
function featureFacetWhere(query: CatalogQuery): SQL {
  const parts = [whereClause(query, { feature: true })];
  for (const feature of query.features) parts.push(sql`(f.key = ${feature} OR ${featureTrue(feature)})`);
  return sql.join(parts, sql` AND `);
}

const ORDER_BY: Record<SortKey, string> = {
  recommended: "featured DESC, gen_rank DESC, grade_rank ASC, price ASC",
  "price-asc": "price ASC",
  "price-desc": "price DESC",
  "newest-model": "gen_rank DESC, price ASC",
  "recently-added": "date_trunc('milliseconds', first_seen_at) DESC, price ASC",
};
// Viimane võrdlus SKU järgi (nagu filtering.ts → sortItems): sama URL → sama järjekord
const orderBy = (sort: SortKey) => sql.raw(`${ORDER_BY[sort]}, sku COLLATE "C" ASC, id ASC`);

// ---- Avalikud päringud -----------------------------------------------------------------------------------

export interface CatalogPageResult {
  items: CatalogItem[];
  total: number;
  page: number;
  pageCount: number;
  facets: CatalogFacets;
}

const withLocked = (query: CatalogQuery, locked: Partial<FacetSelection>): CatalogQuery => ({ ...query, facets: { ...query.facets, ...locked } });

/**
 * Kataloogi lehekülg: SQL filtreerib, sorteerib ja võtab PAGE_SIZE pakkumist; tahud arvutatakse ühe päringuga.
 * Seejärel loetakse kaardi andmed ja pildid ainult nende pakkumiste mudelite kohta.
 */
export async function queryCatalogPage(db: Db, query: CatalogQuery, locked: Partial<FacetSelection> = {}): Promise<CatalogPageResult> {
  const effective = withLocked(query, locked);
  const where = whereClause(effective);
  const pageSql = (offset: number) =>
    withStorefront(sql`SELECT id, model_id, count(*) OVER()::int AS total FROM storefront WHERE ${where} ORDER BY ${orderBy(effective.sort)} LIMIT ${PAGE_SIZE} OFFSET ${offset}`);
  const pageRows = (offset: number) => db.execute<{ id: string; model_id: string; total: number }>(pageSql(offset));

  // Üks paralleelne ring andmebaasi: lehekülje ID-d, tahud ja nende mudelite kaardi andmed (sama lehekülje
  // alampäring) korraga — iga ring maksab Verceli ja Neoni vahel võrguaja (vt docs/ARCHITECTURE.md).
  const offset = (effective.page - 1) * PAGE_SIZE;
  const [first, facets, prefetched] = await Promise.all([
    pageRows(offset),
    queryFacets(db, effective),
    hydrateModels(db, sql`${productModels.id} IN (SELECT model_id FROM (${pageSql(offset)}) AS page_rows)`),
  ]);
  let rows = first.rows;
  let total = rows[0]?.total ?? 0;
  let page = effective.page;
  if (rows.length === 0 && page > 1) {
    // Lehekülg on tulemustest kaugemal → viimane lehekülg (nagu varem)
    const counted = await db.execute<{ total: number }>(withStorefront(sql`SELECT count(*)::int AS total FROM storefront WHERE ${where}`));
    total = counted.rows[0]?.total ?? 0;
    page = Math.max(1, Math.ceil(total / PAGE_SIZE));
    rows = total > 0 ? (await pageRows((page - 1) * PAGE_SIZE)).rows : [];
  }

  const byListingId = new Map(prefetched.map(({ listingId, item }) => [listingId, item]));
  const items = rows.every((row) => byListingId.has(row.id)) ? rows.map((row) => byListingId.get(row.id)!) : await hydrateListings(db, rows);
  return {
    items,
    total,
    page,
    pageCount: Math.max(1, Math.ceil(total / PAGE_SIZE)),
    facets,
  };
}

/**
 * Tahud (filtri valikud koos loenduritega) ÜHE päringuga: iga tahu loendur arvestab kõiki teisi aktiivseid
 * filtreid, aga mitte sama tahu teisi valikuid (nagu filtering.ts → computeFacets).
 */
export async function queryFacets(db: Db, query: CatalogQuery): Promise<CatalogFacets> {
  const multi = MULTI_FACET_KEYS.map((key) => {
    const column = sql.raw(FACET_COLUMN[key]);
    const where = whereClause(query, { facet: key });
    const own = sql`SELECT ${key}::text AS k, ${column} AS v, count(*)::int AS n, NULL::int AS n2 FROM storefront WHERE ${where} AND ${column} IS NOT NULL GROUP BY ${column}`;
    return key === "series"
      ? sql`${own} UNION ALL SELECT 'series-parent', series_parent, count(*)::int, NULL FROM storefront WHERE ${where} AND series_parent IS NOT NULL GROUP BY series_parent`
      : own;
  });
  const featureKeys = sql.join(FEATURE_KEYS.map((key) => sql`${key}`), sql`, `);
  const features = sql`SELECT 'feature', f.key, count(*)::int, NULL FROM storefront CROSS JOIN unnest(ARRAY[${featureKeys}]::text[]) AS f(key)
    WHERE feat -> f.key = 'true'::jsonb AND ${featureFacetWhere(query)} GROUP BY f.key`;
  const price = sql`SELECT 'price', NULL, floor(min(price) / 100.0)::int, ceil(max(price) / 100.0)::int FROM storefront WHERE ${whereClause(query, { price: true })}`;

  const result = await db.execute<{ k: string; v: string | null; n: number | null; n2: number | null }>(
    withStorefront(sql.join([...multi, features, price], sql` UNION ALL `)),
  );

  const counts = new Map<string, Map<string, number>>();
  let priceRange: CatalogFacets["price"] = null;
  for (const row of result.rows) {
    if (row.k === "price") {
      if (row.n !== null && row.n2 !== null) priceRange = { min: row.n, max: row.n2 };
      continue;
    }
    const map = counts.get(row.k) ?? new Map<string, number>();
    map.set(row.v!, row.n!);
    counts.set(row.k, map);
  }

  const facets = {} as Record<MultiFacetKey, FacetOption[]>;
  for (const key of MULTI_FACET_KEYS) {
    const definition = FACETS[key];
    const own = new Map(counts.get(key) ?? []);
    // Valitud väärtus jääb nähtavale ka siis, kui valikutes seda pole (nt üldisem "thinkpad") või tulemusi on 0
    for (const value of query.facets[key]) {
      if (!own.has(value)) own.set(value, (key === "series" ? counts.get("series-parent")?.get(value) : undefined) ?? 0);
    }
    facets[key] = [...own.entries()]
      .sort(([a], [b]) => definition.compare(a, b))
      .map(([value, count]) => ({ value, label: definition.optionLabel(value), count, selected: query.facets[key].includes(value) }));
  }

  const featureCounts = counts.get("feature") ?? new Map<string, number>();
  const featureOptions: FacetOption[] = [];
  for (const feature of FEATURE_ORDER) {
    const count = featureCounts.get(feature) ?? 0;
    const selected = query.features.includes(feature);
    if (count > 0 || selected) featureOptions.push({ value: feature, label: FEATURE_LABELS[feature], count, selected });
  }

  return { multi: facets, features: featureOptions, price: priceRange };
}

/** Pakkumiste ID-d (järjekorras) → täis CatalogItem'id, lugedes ainult nende mudelite andmed ja pildid. */
async function hydrateListings(db: Db, rows: { id: string; model_id: string }[]): Promise<CatalogItem[]> {
  if (rows.length === 0) return [];
  const items = await hydrateModels(db, inArray(productModels.id, [...new Set(rows.map((row) => row.model_id))]));
  const byListingId = new Map(items.map((item) => [item.listingId, item.item]));
  return rows.flatMap((row) => {
    const item = byListingId.get(row.id);
    return item ? [item] : [];
  });
}

/**
 * Valitud mudelite poe pakkumised koos piltidega — sama päring ja teisendus nagu varasem täiskataloog,
 * aga piiratud mudelitega (mudeli piltide varu = sama mudeli teise pakkumise pildid jääb samaks).
 */
async function hydrateModels(db: Db, modelWhere: SQL): Promise<{ listingId: string; item: CatalogItem }[]> {
  const modelIds = db.select({ id: productModels.id }).from(productModels).where(and(eq(productModels.status, "ACTIVE"), modelWhere));
  const listingWhere = and(
    eq(supplierListings.status, "ACTIVE"),
    or(isNull(supplierListings.available), eq(supplierListings.available, true)),
    inArray(supplierListings.productModelId, modelIds),
  );
  const listingIds = db.select({ id: supplierListings.id }).from(supplierListings).where(listingWhere);

  const [models, listings, images, unitImages] = await Promise.all([
    db.select(pickColumns(productModels, STOREFRONT_MODEL_COLUMNS)).from(productModels).where(and(eq(productModels.status, "ACTIVE"), modelWhere)),
    db
      .select({ ...pickColumns(supplierListings, STOREFRONT_LISTING_COLUMNS) })
      .from(supplierListings)
      .where(listingWhere)
      .orderBy(asc(supplierListings.sku)),
    db
      .select(pickColumns(productImages, STOREFRONT_IMAGE_COLUMNS))
      .from(productImages)
      .where(and(eq(productImages.isHidden, false), inArray(productImages.productModelId, modelIds)))
      .orderBy(asc(productImages.productModelId), asc(productImages.position)),
    db
      .select(pickColumns(listingImages, STOREFRONT_LISTING_IMAGE_COLUMNS))
      .from(listingImages)
      .where(and(eq(listingImages.isHidden, false), inArray(listingImages.supplierListingId, listingIds)))
      .orderBy(asc(listingImages.supplierListingId), asc(listingImages.position)),
  ]);
  const { items } = mapCatalogRows(models, listings, images, unitImages);
  const listingIdBySku = new Map(listings.map((listing) => [listing.sku, listing.id]));
  // searchText jääb serverisse (otsing käib SQL-is)
  return items.map(({ product, variant }) => ({ listingId: listingIdBySku.get(variant.sku)!, item: { product, variant } }));
}

/** Tooteleht: üks mudel slug'i järgi + selle poe pakkumised ja pildid. Ei sõltu kataloogi suurusest. */
export async function queryProductDetail(db: Db, slug: string): Promise<{ product: CatalogItem["product"]; variants: CatalogItem["variant"][] } | null> {
  const items = (await hydrateModels(db, eq(productModels.slug, slug))).map(({ item }) => item);
  if (items.length === 0) return null;
  // Poes kohapeal → hind; seejärel ülejäänud → hind (domain/catalog/configuration-order.ts)
  const variants = sortConfigurations(items.map((item) => item.variant));
  return { product: items[0].product, variants };
}

/** Pakkumised avaliku ID järgi (ostukorv, võrdlus) — ainult nende mudelid. */
export async function queryItemsByVariantIds(db: Db, ids: string[]): Promise<CatalogItem[]> {
  const unique = [...new Set(ids)].slice(0, 100);
  if (unique.length === 0) return [];
  const publicId = sql`lower(${supplierListings.supplier} || '-' || ${supplierListings.supplierProductId})`;
  const modelIds = db
    .selectDistinct({ id: supplierListings.productModelId })
    .from(supplierListings)
    .where(sql`${publicId} IN (${sql.join(unique.map((id) => sql`${id}`), sql`, `)})`);
  const byId = new Map((await hydrateModels(db, inArray(productModels.id, modelIds))).map(({ item }) => [item.variant.id, item]));
  return ids.flatMap((id) => {
    const item = byId.get(id);
    return item ? [item] : [];
  });
}

/** Esimesed `limit` pakkumist antud sorteeringu ja filtritega (avaleht, parimad pakkumised). */
export async function queryTopItems(db: Db, query: CatalogQuery, limit: number, options: { featuredOnly?: boolean; onePerModel?: boolean } = {}): Promise<CatalogItem[]> {
  const where = sql.join([whereClause(query), ...(options.featuredOnly ? [sql`featured`] : [])], sql` AND `);
  const inner = sql`SELECT id, model_id, sku, featured, gen_rank, grade_rank, price, first_seen_at FROM storefront WHERE ${where}`;
  const body = options.onePerModel
    ? // Igast mudelist üks (soovituslikum) pakkumine — DISTINCT ON + välimine sorteerimine
      sql`SELECT id, model_id FROM (SELECT DISTINCT ON (model_id) * FROM (${inner}) s ORDER BY model_id, ${orderBy(query.sort)}) t ORDER BY ${orderBy(query.sort)} LIMIT ${limit}`
    : sql`${inner} ORDER BY ${orderBy(query.sort)} LIMIT ${limit}`;
  const rows = await db.execute<{ id: string; model_id: string }>(withStorefront(body));
  return hydrateListings(db, rows.rows);
}

export type StorefrontKeyRow = {
  id: string;
  model_id: string;
  sku: string;
  brand: string;
  family: string;
  series: string;
  screen: number;
  cpu: string;
  cpu_family_db: string | null;
  ram: number;
  storage: number;
  gpu_dedicated: boolean | null;
  stock: number | null;
  price: number;
};

/**
 * Kitsas projektsioon (ilma piltide ja tekstideta) — avalehe statistika, seeriad, sarnased tooted ja leidja
 * eelvalik. `where` on lisatingimus (parameetritega SQL).
 */
export async function queryKeyRows(db: Db, where?: SQL): Promise<StorefrontKeyRow[]> {
  const rows = await db.execute<StorefrontKeyRow>(
    withStorefront(sql`SELECT id, model_id, sku, brand, family, series, screen::float8 AS screen, cpu, cpu_family_db, ram::float8 AS ram,
      storage::float8 AS storage, gpu_dedicated, stock::float8 AS stock, price::float8 AS price FROM storefront ${where ? sql`WHERE ${where}` : sql``}`),
  );
  return rows.rows;
}

/** ID-de järgi (järjekord säilib) — sarnaste toodete ja leidja tulemuste hüdreerimiseks. */
export async function queryItemsByListingIds(db: Db, rows: { id: string; model_id: string }[]): Promise<CatalogItem[]> {
  return hydrateListings(db, rows);
}

/** Otsingusoovitused: SQL-is filtreeritud ja järjestatud (täpne sõna 2 p, sõna algus 1 p), siis hüdreeritud. */
export async function querySearchSuggestions(db: Db, q: string, limit: number): Promise<CatalogItem[]> {
  const tokens = tokenize(q);
  if (tokens.length === 0) return [];
  const score = sql.join(
    tokens.map((token) => sql`(CASE WHEN (' ' || search_doc || ' ') LIKE ${`% ${token} %`} THEN 2 WHEN (' ' || search_doc) LIKE ${`% ${token}%`} THEN 1 ELSE 0 END)`),
    sql` + `,
  );
  const where = sql.join(tokens.map((token) => sql`(' ' || search_doc) LIKE ${`% ${token}%`}`), sql` AND `);
  const rows = await db.execute<{ id: string; model_id: string }>(
    withStorefront(sql`SELECT id, model_id FROM storefront WHERE ${where} ORDER BY ${score} DESC, price ASC, sku COLLATE "C" ASC LIMIT ${limit}`),
  );
  return hydrateListings(db, rows.rows);
}

/** Testide ja `perf:bench --verify` jaoks: SQL-i otsingutekst ja filtri võtmed pakkumise kaupa. */
export async function queryStorefrontKeysForVerify(db: Db) {
  const rows = await db.execute<{ sku: string; series: string; cpu_family: string | null; cpu_gen: string | null; search_doc: string; gen_rank: number }>(
    withStorefront(sql`SELECT sku, series, cpu_family, cpu_gen, search_doc, gen_rank::float8 AS gen_rank FROM storefront`),
  );
  return rows.rows;
}

/** Poes nähtavate mudelite slug'id (sitemap, generateStaticParams). */
export async function queryProductSlugs(db: Db): Promise<string[]> {
  const rows = await db.execute<{ slug: string }>(
    withStorefront(sql`SELECT DISTINCT p.slug FROM storefront s JOIN product_models p ON p.id = s.model_id ORDER BY p.slug`),
  );
  return rows.rows.map((row) => row.slug);
}

/** Avalehe statistika ühe agregaadiga: pakkumiste arv, odavaim hind, "Kohe saadaval" (kogus teadmata, vt showroom.ts). */
export async function queryCatalogStats(db: Db): Promise<{ count: number; minPriceCents: number | null; immediateCount: number }> {
  const rows = await db.execute<{ count: number; min_price: number | null; immediate: number }>(
    withStorefront(sql`SELECT count(*)::int AS count, min(price)::int AS min_price, (count(*) FILTER (WHERE stock IS NULL))::int AS immediate FROM storefront`),
  );
  const row = rows.rows[0];
  return { count: row?.count ?? 0, minPriceCents: row?.min_price ?? null, immediateCount: row?.immediate ?? 0 };
}

/** Seeriate kokkuvõte (tootja + filtri seeria väärtus → arv, odavaim hind) ühe GROUP BY päringuga. */
export async function querySeriesStats(db: Db): Promise<{ brand: string; series: string; count: number; min_price: number }[]> {
  const rows = await db.execute<{ brand: string; series: string; count: number; min_price: number }>(
    withStorefront(sql`SELECT brand, series, count(*)::int AS count, min(price)::int AS min_price FROM storefront GROUP BY brand, series`),
  );
  return rows.rows;
}

/**
 * Sarnased tooted: kohustuslik hinnavahemik (±25%) ja "mitte sama mudel" SQL-is, punktid (domain/catalog/similar.ts)
 * kitsa projektsiooni peal, seejärel hüdreeritakse ainult `limit` valitud pakkumist.
 */
export async function querySimilarItems(db: Db, current: SimilarityItem, limit: number): Promise<CatalogItem[]> {
  const price = current.variant.price.saleCents;
  // Kohustuslik hinnavahemik ±25% ja teine mudel juba SQL-is; punktid arvutatakse kitsa projektsiooni peal
  const rows = await queryKeyRows(
    db,
    sql`price BETWEEN ${Math.ceil(price * (1 - SIMILAR_PRICE_TOLERANCE))} AND ${Math.floor(price * (1 + SIMILAR_PRICE_TOLERANCE))}
      AND model_id NOT IN (SELECT id FROM product_models WHERE slug = ${current.product.slug})`,
  );
  const candidates = rows.map((row) => ({
    row,
    product: { slug: row.model_id, brand: row.brand as BrandCode, series: row.family, screenSizeIn: row.screen },
    variant: {
      id: row.id,
      sku: row.sku,
      ramGb: row.ram,
      storageGb: row.storage,
      cpu: { family: row.cpu_family_db as CpuFamily | null, model: row.cpu },
      gpu: { dedicated: row.gpu_dedicated ?? false },
      price: { saleCents: row.price },
      stock: { available: true },
    },
  }));
  // Kandidaadi "slug" = mudeli ID (sama mudel on SQL-is juba välja jäetud; ühe pakkumise reegel mudeli kohta jääb)
  const best = findSimilarItems(current, candidates, limit);
  return queryItemsByListingIds(db, best.map(({ row }) => row));
}

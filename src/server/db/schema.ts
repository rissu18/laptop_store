import { sql } from "drizzle-orm";
import type { ListingDetails } from "@/domain/catalog/listing-details";
import {
  bigserial,
  boolean,
  check,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

/**
 * PostgreSQL skeem (Drizzle ORM). Vt docs/DATABASE.md.
 *
 * Põhimõtted:
 * - ProductModel (mudel) ja SupplierListing (müüdav konfiguratsioon) on eraldi.
 * - Raha täisarvuna sentides (*_cents).
 * - Puuduv tarnija väärtus = NULL. Vaikeväärtusi ("12 kuud", "Windows 11") EI panda.
 * - Andmete omanik:
 *     tarnija väljad  → tavalised veerud (tarnija sync kirjutab neid)
 *     admini parandus → `manual_overrides` (JSONB) — sync ei puutu seda kunagi
 *     admini väljad   → status, featured, description … (sync ei kirjuta)
 *   Kuvatav väärtus = manual_overrides[väli] ?? veerg.
 * - Staatused on tekst + CHECK piirang (mitte PostgreSQL ENUM), et skeemi oleks lihtne muuta
 *   ja testid saaksid töötada eraldi skeemis.
 */

const timestamps = {
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
};

export const PRICE_SOURCES = ["PRICING", "SUPPLIER"] as const;
export type PriceSource = (typeof PRICE_SOURCES)[number];

export const CATALOG_STATUSES = ["ACTIVE", "HIDDEN", "ARCHIVED"] as const;
/** supplier_listings.quality_hold — vt veeru kommentaari */
export const QUALITY_HOLDS = ["REVIEW", "BLOCKED"] as const;
export type QualityHold = (typeof QUALITY_HOLDS)[number];
export type CatalogStatus = (typeof CATALOG_STATUSES)[number];
const statusCheck = (name: string, column: string) =>
  check(name, sql.raw(`${column} in ('ACTIVE', 'HIDDEN', 'ARCHIVED')`));

// ---------------------------------------------------------------------------
// Admin
// ---------------------------------------------------------------------------

export const ADMIN_ROLES = ["ADMIN"] as const;

export const adminUsers = pgTable(
  "admin_users",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    email: text("email").notNull(),
    name: text("name").notNull(),
    /** scrypt räsi (vt src/server/auth/password.ts) — parooli ennast ei salvestata */
    passwordHash: text("password_hash").notNull(),
    role: text("role", { enum: ADMIN_ROLES }).notNull().default("ADMIN"),
    isActive: boolean("is_active").notNull().default(true),
    lastLoginAt: timestamp("last_login_at", { withTimezone: true }),
    ...timestamps,
  },
  (t) => [uniqueIndex("admin_users_email_uq").on(t.email)],
);

export const adminSessions = pgTable(
  "admin_sessions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => adminUsers.id, { onDelete: "cascade" }),
    /** SHA-256 räsi küpsises olevast juhuslikust tokenist (tokenit ennast ei salvestata) */
    tokenHash: text("token_hash").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).notNull().defaultNow(),
    ip: text("ip"),
    userAgent: text("user_agent"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("admin_sessions_token_uq").on(t.tokenHash), index("admin_sessions_user_idx").on(t.userId)],
);

/** Sisselogimiskatsed (rate limiting töötab ka mitme serverless-instantsi vahel). */
export const loginAttempts = pgTable(
  "login_attempts",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    email: text("email").notNull(),
    ip: text("ip").notNull(),
    success: boolean("success").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("login_attempts_email_idx").on(t.email, t.createdAt), index("login_attempts_ip_idx").on(t.ip, t.createdAt)],
);

// ---------------------------------------------------------------------------
// Kataloog
// ---------------------------------------------------------------------------

export const productModels = pgTable(
  "product_models",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    slug: text("slug").notNull(),
    /** "lenovo" | "dell" | "hp" */
    manufacturer: text("manufacturer").notNull(),
    /** Seeria: "ThinkPad", "ThinkPad P", "Latitude", "EliteBook" */
    family: text("family").notNull(),
    /** "T14 Gen 3" */
    model: text("model").notNull(),
    /** "Gen 3", "G8" — kui mudelinimes on */
    generation: text("generation"),
    // Mudeli tasemel tehnilised andmed (tarnijalt)
    screenSizeIn: numeric("screen_size_in", { precision: 3, scale: 1, mode: "number" }),
    weightKg: numeric("weight_kg", { precision: 4, scale: 2, mode: "number" }),
    usbAPorts: integer("usb_a_ports"),
    usbCPorts: integer("usb_c_ports"),
    wifi: text("wifi"),
    bluetooth: text("bluetooth"),
    // Admini väljad
    description: text("description"),
    featured: boolean("featured").notNull().default(false),
    status: text("status", { enum: CATALOG_STATUSES }).notNull().default("ACTIVE"),
    /** Admini parandused tarnijalt tulnud väljadele (vt docs/ADMIN.md → Manual override) */
    manualOverrides: jsonb("manual_overrides").$type<Record<string, unknown>>().notNull().default({}),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("product_models_slug_uq").on(t.slug),
    index("product_models_status_idx").on(t.status),
    statusCheck("product_models_status_ck", "status"),
  ],
);

export const IDENTIFIER_KINDS = ["GTIN", "MPN", "ICECAT_ID", "CONFIRMED_ICECAT_ID", "REJECTED_ICECAT_ID"] as const;
export const IDENTIFIER_SOURCES = ["SUPPLIER", "CURATED", "ADMIN"] as const;

/** Mudeli identifikaatorid (GTIN, tootja kood, Icecat ID) ja admini Icecati otsused. */
export const productIdentifiers = pgTable(
  "product_identifiers",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    productModelId: uuid("product_model_id")
      .notNull()
      .references(() => productModels.id, { onDelete: "cascade" }),
    kind: text("kind", { enum: IDENTIFIER_KINDS }).notNull(),
    value: text("value").notNull(),
    source: text("source", { enum: IDENTIFIER_SOURCES }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("product_identifiers_uq").on(t.productModelId, t.kind, t.value)],
);

export const supplierListings = pgTable(
  "supplier_listings",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    productModelId: uuid("product_model_id")
      .notNull()
      .references(() => productModels.id, { onDelete: "restrict" }),
    /** Tarnija kood: "mock" (arendus), hiljem nt "foxway" */
    supplier: text("supplier").notNull(),
    supplierSku: text("supplier_sku"),
    /** Tarnija pakkumise ID — sync'i võti koos tarnijaga */
    supplierProductId: text("supplier_product_id").notNull(),
    /** Meie SKU */
    sku: text("sku").notNull(),
    // Tarnija väljad (NULL = tarnija ei andnud)
    cpu: text("cpu"),
    cpuFamily: text("cpu_family"),
    /** Normaliseeritud põlvkond, nt "intel-12", "amd-5000", "ultra-1" */
    cpuGeneration: text("cpu_generation"),
    ramGb: integer("ram_gb"),
    ramType: text("ram_type"),
    storageGb: integer("storage_gb"),
    gpu: text("gpu"),
    gpuDedicated: boolean("gpu_dedicated"),
    screenSizeIn: numeric("screen_size_in", { precision: 3, scale: 1, mode: "number" }),
    resolution: text("resolution"),
    resolutionLabel: text("resolution_label"),
    panel: text("panel"),
    touchscreen: boolean("touchscreen"),
    keyboard: text("keyboard"),
    grade: text("grade"),
    /** Haruldasemad omadused (numpad, Thunderbolt …): true/false/null. JSONB, sest neid on palju ja need muutuvad. */
    features: jsonb("features").$type<Record<string, boolean | null>>().notNull().default({}),
    operatingSystem: text("operating_system"),
    warrantyMonths: integer("warranty_months"),
    /** Aku seisukord % (tarnija teatatud) */
    batteryHealthPct: integer("battery_health_pct"),
    chargerIncluded: boolean("charger_included"),
    /** Täpne laokogus; NULL = tarnija ei anna kogust (vt `available`) */
    stock: integer("stock"),
    /**
     * Saadavus tarnija andmetel, sõltumata kogusest (vt docs/LAPTOPID_SYNC.md):
     *   true  = tarnija kinnitab, et laos on (kogus võib olla teadmata — `stock` NULL)
     *   false = tarnija viimases usaldusväärses täielikus snapshot'is toodet polnud
     *   NULL  = tarnija annab ainult koguse (`stock`) — vana käitumine (mock)
     */
    available: boolean("available"),
    deliveryMinDays: integer("delivery_min_days"),
    deliveryMaxDays: integer("delivery_max_days"),
    /** Ostuhind (meie kulu). NULL = teadmata — müügihinda ega viitehinda siia EI panda. */
    supplierPriceCents: integer("supplier_price_cents"),
    vatScheme: text("vat_scheme"),
    // Meie hind (hinnastamismootor / admin)
    salePriceCents: integer("sale_price_cents"),
    referencePriceCents: integer("reference_price_cents"),
    /**
     * Kust müügihind tuleb:
     *   PRICING  = hinnastamismootor ostuhinnast (sale_price_cents on admini/hinnastamise väli)
     *   SUPPLIER = tarnija jaehind (sale_price_cents on TARNIJA väli, sync kirjutab; admini parandus
     *              läheb manual_overrides.salePriceCents alla ja sync seda ei puutu)
     */
    priceSource: text("price_source", { enum: PRICE_SOURCES }).notNull().default("PRICING"),
    /** Konfiguratsiooni kaal (tarnija), kui tarnija annab selle pakkumise tasemel */
    weightKg: numeric("weight_kg", { precision: 4, scale: 2, mode: "number" }),
    /** Tarnija märkus seisukorra/defektide kohta lihttekstina (HTML eemaldatud) */
    conditionNotes: text("condition_notes"),
    /** Struktureeritud lisaandmed, millele filtrit pole (pordid, värskendussagedus …) — vt ListingDetails */
    details: jsonb("details").$type<ListingDetails>().notNull().default({}),
    status: text("status", { enum: CATALOG_STATUSES }).notNull().default("ACTIVE"),
    manualOverrides: jsonb("manual_overrides").$type<Record<string, unknown>>().notNull().default({}),
    /**
     * Tarnija andmetel on see konfiguratsioon käibemaksu marginaalskeemi kaup (Foxway IsVatMargin). SKU tasemel —
     * sama mudeli eri SKU-del võib see erineda. NULL = tarnija ei anna. Ainult admin/diagnostika (hinnastus ei loe).
     */
    supplierVatMargin: boolean("supplier_vat_margin"),
    /**
     * Tarnija andmete kvaliteedi/ohutuse kinnipidamine (sync kirjutab, nt Foxway rikkeklassifikaator):
     *   NULL      = poodi võib (tavaline)
     *   'REVIEW'  = vajab käsitsi ülevaatust (tundmatu rike, ebamäärane andmestik) — poes EI kuvata
     *   'BLOCKED' = ei müüda (nt katkine ekraan, rikkis port) — poes EI kuvata
     * Admin võib parandusega (`manual_overrides.qualityHold`) teadlikult avaldada; sync seda ei puutu.
     */
    qualityHold: text("quality_hold", { enum: QUALITY_HOLDS }),
    /** Inimloetav põhjus (adminile), nt "Rike: Faulty camera (BLOCK)" */
    qualityHoldReason: text("quality_hold_reason"),
    /** Tarnija toorandmed silumiseks — äriloogika neid ei loe */
    rawData: jsonb("raw_data"),
    firstSeenAt: timestamp("first_seen_at", { withTimezone: true }).notNull().defaultNow(),
    /** Viimane kord, kui sync selle rea andmeid kinnitas või muutis */
    lastSyncedAt: timestamp("last_synced_at", { withTimezone: true }),
    /** Viimane usaldusväärne snapshot, kus pakkumine oli olemas */
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("supplier_listings_supplier_product_uq").on(t.supplier, t.supplierProductId),
    uniqueIndex("supplier_listings_sku_uq").on(t.sku),
    index("supplier_listings_model_idx").on(t.productModelId),
    index("supplier_listings_status_idx").on(t.status),
    statusCheck("supplier_listings_status_ck", "status"),
    check("supplier_listings_price_source_ck", sql`price_source in ('PRICING', 'SUPPLIER')`),
    check("supplier_listings_quality_hold_ck", sql`quality_hold IS NULL OR quality_hold in ('REVIEW', 'BLOCKED')`),
  ],
);

/**
 * Konkreetse pakkumise (konfiguratsiooni) pildid tarnijalt — nt Laptopid.ee iga toote oma galerii.
 * Eraldi tabel, sest product_images on MUDELI pildid (Icecat), mida admin järjestab mudeli kaupa.
 * Pildid on kaugel (HTTPS); Git'i neid ei laeta.
 */
export const listingImages = pgTable(
  "listing_images",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    supplierListingId: uuid("supplier_listing_id")
      .notNull()
      .references(() => supplierListings.id, { onDelete: "cascade" }),
    /** Allikas, nt "LAPTOPID" */
    source: text("source").notNull(),
    /** Allika pildi ID */
    sourceId: text("source_id").notNull(),
    position: integer("position").notNull(),
    /** Admini otsus — sync ei muuda */
    isHidden: boolean("is_hidden").notNull().default(false),
    thumbnailUrl: text("thumbnail_url").notNull(),
    mediumUrl: text("medium_url").notNull(),
    largeUrl: text("large_url").notNull(),
    /** Originaali mõõdud (loetud pildifaili päisest) */
    width: integer("width").notNull(),
    height: integer("height").notNull(),
    alt: text("alt").notNull(),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("listing_images_source_uq").on(t.supplierListingId, t.source, t.sourceId),
    index("listing_images_listing_idx").on(t.supplierListingId, t.position),
  ],
);

export const INVENTORY_UNIT_STATUSES = ["AVAILABLE", "SOLD", "NOT_LAPTOP", "INVALID", "DEFECT", "UNKNOWN_NOTE", "CONFLICT", "MISSING"] as const;
export type InventoryUnitStatus = (typeof INVENTORY_UNIT_STATUSES)[number];

/**
 * Tarnija füüsiline seade (nt Tech: iga hinnakirja rida = üks konkreetne sülearvuti). Mitu sama konfiguratsiooniga
 * seadet = üks SupplierListing (müüdav konfiguratsioon), mille laoseis = saadaval seadmete arv.
 * Seerianumber on AINULT serveris/adminis — poe päringud seda tabelit ei loe ja kliendile seda ei kuvata.
 * Ajalugu ei kustutata: müüdud / kadunud seade jääb alles (available=false + põhjus).
 */
export const supplierInventoryUnits = pgTable(
  "supplier_inventory_units",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** Tarnija kood, nt "tech" */
    supplier: text("supplier").notNull(),
    /** Tarnija seadme ID (Tech: veerg D) — füüsilise seadme identiteet koos tarnijaga */
    externalUnitId: text("external_unit_id").notNull(),
    /** Seerianumber tarnija kujul (ainult trim; komasid/lisakoode ei tükeldata) */
    serialNumber: text("serial_number"),
    /** Müüdav konfiguratsioon, kuhu seade kuulub (viimati teada); NULL = vigane konfiguratsioon */
    supplierListingId: uuid("supplier_listing_id").references(() => supplierListings.id, { onDelete: "set null" }),
    /** Kas seade on müügis (loetakse pakkumise laoseisu) */
    available: boolean("available").notNull().default(false),
    status: text("status", { enum: INVENTORY_UNIT_STATUSES }).notNull(),
    /** Brand/Model lahter oli värvitud (tarnija märkis müüduks) */
    soldByColor: boolean("sold_by_color").notNull().default(false),
    /** Miks seade pole müügis (inimloetav, adminile) */
    excludedReason: text("excluded_reason"),
    sourceSheet: text("source_sheet"),
    sourceRow: integer("source_row"),
    /** Lähterea toorväärtused (sh märkused) — admini diagnostika, äriloogika ei loe */
    rawData: jsonb("raw_data"),
    firstSeenAt: timestamp("first_seen_at", { withTimezone: true }).notNull().defaultNow(),
    /** Viimane snapshot, kus seade oli hinnakirjas */
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("supplier_inventory_units_supplier_unit_uq").on(t.supplier, t.externalUnitId),
    index("supplier_inventory_units_listing_idx").on(t.supplierListingId, t.available),
    check(
      "supplier_inventory_units_status_ck",
      sql`status in ('AVAILABLE', 'SOLD', 'NOT_LAPTOP', 'INVALID', 'DEFECT', 'UNKNOWN_NOTE', 'CONFLICT', 'MISSING')`,
    ),
  ],
);

export const SYNC_RUN_STATUSES = ["RUNNING", "SUCCESS", "FAILED"] as const;
export const SYNC_RUN_TRIGGERS = ["ADMIN", "CRON", "CLI", "TEST"] as const;

/**
 * Kataloogi sync'i käivitused: andmebaasipõhine lukk (üks RUNNING rida allika kohta — osaline
 * UNIQUE indeks) ja tulemuste ajalugu adminis.
 */
export const catalogSyncRuns = pgTable(
  "catalog_sync_runs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** "LAPTOPID" */
    source: text("source").notNull(),
    status: text("status", { enum: SYNC_RUN_STATUSES }).notNull(),
    trigger: text("trigger", { enum: SYNC_RUN_TRIGGERS }).notNull(),
    triggeredBy: text("triggered_by"),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
    /** Lukk aegub (nt katkenud serverless-funktsioon) — siis võib järgmine käivitus selle üle võtta */
    leaseUntil: timestamp("lease_until", { withTimezone: true }).notNull(),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
    /** received, valid, rejected, created, updated, unchanged, madeUnavailable, reactivated … */
    stats: jsonb("stats").$type<Record<string, unknown>>().notNull().default({}),
    /** Kas snapshot oli usaldusväärne täielik nimekiri (puuduvad märgiti mitte saadavaks) */
    snapshotTrusted: boolean("snapshot_trusted"),
    error: text("error"),
  },
  (t) => [
    uniqueIndex("catalog_sync_runs_running_uq").on(t.source).where(sql`status = 'RUNNING'`),
    index("catalog_sync_runs_source_idx").on(t.source, t.startedAt),
    check("catalog_sync_runs_status_ck", sql`status in ('RUNNING', 'SUCCESS', 'FAILED')`),
  ],
);

export const productImages = pgTable(
  "product_images",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    productModelId: uuid("product_model_id")
      .notNull()
      .references(() => productModels.id, { onDelete: "cascade" }),
    source: text("source", { enum: ["ICECAT", "MANUAL", "SUPPLIER", "PLACEHOLDER"] }).notNull(),
    type: text("type", { enum: ["MODEL_GENERIC", "ACTUAL_UNIT", "PLACEHOLDER"] }).notNull(),
    sourceId: text("source_id").notNull(),
    position: integer("position").notNull(),
    isMain: boolean("is_main").notNull().default(false),
    isHidden: boolean("is_hidden").notNull().default(false),
    /** Avalikud teed/URL-id (testversioonis /media/products/…, hiljem objektisalvestus) */
    thumbnailPath: text("thumbnail_path").notNull(),
    mediumPath: text("medium_path").notNull(),
    largePath: text("large_path").notNull(),
    width: integer("width").notNull(),
    height: integer("height").notNull(),
    alt: text("alt").notNull(),
    originalSourceUrl: text("original_source_url"),
    sourceUpdatedAt: text("source_updated_at"),
    contentHash: text("content_hash"),
    storageKeys: jsonb("storage_keys").$type<string[]>().notNull().default([]),
    downloadedAt: timestamp("downloaded_at", { withTimezone: true }),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("product_images_source_uq").on(t.productModelId, t.source, t.sourceId),
    index("product_images_model_idx").on(t.productModelId, t.position),
  ],
);

/** Icecati vaste ja selle staatus mudeli kohta (Data Quality). */
export const icecatMetadata = pgTable(
  "icecat_metadata",
  {
    productModelId: uuid("product_model_id")
      .primaryKey()
      .references(() => productModels.id, { onDelete: "cascade" }),
    status: text("status", { enum: ["MATCHED", "NEEDS_REVIEW", "NOT_FOUND", "ERROR", "REJECTED"] }).notNull(),
    reason: text("reason"),
    matchType: text("match_type"),
    confidence: numeric("confidence", { precision: 3, scale: 2, mode: "number" }),
    icecatId: text("icecat_id"),
    icecatTitle: text("icecat_title"),
    matchedBy: text("matched_by"),
    titleVerified: boolean("title_verified"),
    imageCount: integer("image_count").notNull().default(0),
    error: text("error"),
    checkedAt: timestamp("checked_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [index("icecat_metadata_status_idx").on(t.status)],
);

// ---------------------------------------------------------------------------
// Hinnastamine ja seaded
// ---------------------------------------------------------------------------

/** Juurdehindluse vahemikud ostuhinna järgi. Ülejäänud hinnastamise seaded: store_settings.pricing */
export const pricingRules = pgTable("pricing_rules", {
  id: uuid("id").primaryKey().defaultRandom(),
  fromCostCents: integer("from_cost_cents").notNull(),
  toCostCents: integer("to_cost_cents"),
  markupFixedCents: integer("markup_fixed_cents").notNull().default(0),
  markupPercentBps: integer("markup_percent_bps").notNull().default(0),
  position: integer("position").notNull().default(0),
  ...timestamps,
});

/** Võti-väärtus seaded; iga võtme struktuur valideeritakse koodis zod-skeemiga. */
export const storeSettings = pgTable("store_settings", {
  key: text("key").primaryKey(),
  value: jsonb("value").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
  updatedBy: text("updated_by"),
});

// ---------------------------------------------------------------------------
// Audit ja süsteemilogid
// ---------------------------------------------------------------------------

export const auditLogs = pgTable(
  "audit_logs",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    adminUserId: uuid("admin_user_id").references(() => adminUsers.id, { onDelete: "set null" }),
    /** Snapshot: e-post jääb logisse ka siis, kui kasutaja kustutatakse */
    adminEmail: text("admin_email"),
    action: text("action").notNull(),
    entityType: text("entity_type").notNull(),
    entityId: text("entity_id"),
    entityLabel: text("entity_label"),
    /** { väli: { from, to } } */
    changes: jsonb("changes").$type<Record<string, { from: unknown; to: unknown }>>(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("audit_logs_created_idx").on(t.createdAt), index("audit_logs_entity_idx").on(t.entityType, t.entityId)],
);

export const LOG_LEVELS = ["DEBUG", "INFO", "WARN", "ERROR"] as const;
export const LOG_SOURCES = ["APPLICATION", "DATABASE", "ADMIN", "AUTH", "ICECAT", "LAPTOPID", "TECH", "FOXWAY"] as const;

export const systemLogs = pgTable(
  "system_logs",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    level: text("level", { enum: LOG_LEVELS }).notNull(),
    source: text("source", { enum: LOG_SOURCES }).notNull(),
    message: text("message").notNull(),
    details: jsonb("details"),
    /** Lühike viite-ID, mida näidatakse kasutajale veateates */
    errorId: text("error_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("system_logs_created_idx").on(t.createdAt), index("system_logs_level_idx").on(t.level, t.source)],
);

// ---------------------------------------------------------------------------
// Sooduskoodid (vt docs/DISCOUNTS.md)
// ---------------------------------------------------------------------------

export const DISCOUNT_TYPE_VALUES = ["PERCENTAGE", "FIXED_AMOUNT", "FREE_SHIPPING"] as const;
/** Admini määratud olek. SCHEDULED ja EXPIRED arvutatakse kuupäevadest (ei salvestata). */
export const DISCOUNT_STATUS_VALUES = ["DRAFT", "ACTIVE", "DISABLED", "ARCHIVED"] as const;
export const DISCOUNT_SCOPE_VALUES = ["ALL_PRODUCTS", "SELECTED_MANUFACTURERS", "SELECTED_PRODUCT_MODELS", "SELECTED_LISTINGS"] as const;
/** INCLUDE = kehtib sellele, EXCLUDE = välistatud (välistus on alati ülimuslik) */
export const DISCOUNT_TARGET_MODES = ["INCLUDE", "EXCLUDE"] as const;

const inList = (name: string, column: string, values: readonly string[]) => check(name, sql.raw(`${column} in (${values.map((v) => `'${v}'`).join(", ")})`));

export const discountCodes = pgTable(
  "discount_codes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** Admini sisestatud kuju kuvamiseks, nt "Sügis10" */
    code: text("code").notNull(),
    /** Võrdlemiseks: trim + NFKC + suurtähed → "SÜGIS10" (UNIQUE) */
    normalizedCode: text("normalized_code").notNull(),
    name: text("name").notNull(),
    internalDescription: text("internal_description"),
    type: text("type", { enum: DISCOUNT_TYPE_VALUES }).notNull(),
    /** PERCENTAGE: baaspunktid (1000 = 10%); FIXED_AMOUNT: sendid; FREE_SHIPPING: 0 */
    value: integer("value").notNull(),
    status: text("status", { enum: DISCOUNT_STATUS_VALUES }).notNull().default("DRAFT"),
    /** Tuletatud veerg (status = 'ACTIVE') — ei saa kunagi staatusega vastuollu minna */
    active: boolean("active").generatedAlwaysAs(sql`status = 'ACTIVE'`),
    startsAt: timestamp("starts_at", { withTimezone: true }),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    minimumSubtotalCents: integer("minimum_subtotal_cents"),
    maximumDiscountCents: integer("maximum_discount_cents"),
    usageLimit: integer("usage_limit"),
    /** Kinnitatud kasutused (discount_redemptions CONFIRMED). Koodi kontrollimine seda EI suurenda. */
    usageCount: integer("usage_count").notNull().default(0),
    scope: text("scope", { enum: DISCOUNT_SCOPE_VALUES }).notNull().default("ALL_PRODUCTS"),
    /** Marginaalikaitse: soodustus ei vii hinda alla hinnastamise miinimumkasumi (vaikimisi sees) */
    respectMinimumMargin: boolean("respect_minimum_margin").notNull().default(true),
    createdBy: text("created_by"),
    updatedBy: text("updated_by"),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("discount_codes_normalized_code_uq").on(t.normalizedCode),
    index("discount_codes_status_idx").on(t.status),
    inList("discount_codes_type_ck", "type", DISCOUNT_TYPE_VALUES),
    inList("discount_codes_status_ck", "status", DISCOUNT_STATUS_VALUES),
    inList("discount_codes_scope_ck", "scope", DISCOUNT_SCOPE_VALUES),
    check("discount_codes_value_ck", sql`value >= 0 AND (type <> 'PERCENTAGE' OR value <= 10000)`),
    check("discount_codes_dates_ck", sql`expires_at IS NULL OR starts_at IS NULL OR expires_at > starts_at`),
    check("discount_codes_usage_ck", sql`usage_count >= 0 AND (usage_limit IS NULL OR usage_limit > 0)`),
  ],
);

export const discountManufacturers = pgTable(
  "discount_manufacturers",
  {
    discountCodeId: uuid("discount_code_id")
      .notNull()
      .references(() => discountCodes.id, { onDelete: "cascade" }),
    /** Tootja kood (lenovo, dell, hp) — sama mis product_models.manufacturer */
    manufacturer: text("manufacturer").notNull(),
  },
  (t) => [uniqueIndex("discount_manufacturers_uq").on(t.discountCodeId, t.manufacturer)],
);

export const discountProductModels = pgTable(
  "discount_product_models",
  {
    discountCodeId: uuid("discount_code_id")
      .notNull()
      .references(() => discountCodes.id, { onDelete: "cascade" }),
    productModelId: uuid("product_model_id")
      .notNull()
      .references(() => productModels.id, { onDelete: "cascade" }),
    mode: text("mode", { enum: DISCOUNT_TARGET_MODES }).notNull(),
  },
  (t) => [uniqueIndex("discount_product_models_uq").on(t.discountCodeId, t.productModelId, t.mode), inList("discount_product_models_mode_ck", "mode", DISCOUNT_TARGET_MODES)],
);

export const discountSupplierListings = pgTable(
  "discount_supplier_listings",
  {
    discountCodeId: uuid("discount_code_id")
      .notNull()
      .references(() => discountCodes.id, { onDelete: "cascade" }),
    supplierListingId: uuid("supplier_listing_id")
      .notNull()
      .references(() => supplierListings.id, { onDelete: "cascade" }),
    mode: text("mode", { enum: DISCOUNT_TARGET_MODES }).notNull(),
  },
  (t) => [uniqueIndex("discount_supplier_listings_uq").on(t.discountCodeId, t.supplierListingId, t.mode), inList("discount_supplier_listings_mode_ck", "mode", DISCOUNT_TARGET_MODES)],
);

export const REDEMPTION_STATUSES = ["PENDING", "CONFIRMED", "CANCELLED"] as const;

/**
 * Sooduskoodi kasutus tellimuses. Täidetakse alles koos Order süsteemiga:
 * tellimuse loomisel PENDING (koht reserveeritud), makse kinnitamisel CONFIRMED (usage_count kasvab),
 * tühistamisel CANCELLED. Snapshot-väljad säilitavad tolle hetke info ka siis, kui koodi hiljem muudetakse.
 */
export const discountRedemptions = pgTable(
  "discount_redemptions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    discountCodeId: uuid("discount_code_id")
      .notNull()
      .references(() => discountCodes.id, { onDelete: "restrict" }),
    orderId: uuid("order_id")
      .notNull()
      .references(() => orders.id, { onDelete: "restrict" }),
    status: text("status", { enum: REDEMPTION_STATUSES }).notNull().default("PENDING"),
    codeSnapshot: text("code_snapshot").notNull(),
    typeSnapshot: text("type_snapshot", { enum: DISCOUNT_TYPE_VALUES }).notNull(),
    valueSnapshot: integer("value_snapshot").notNull(),
    discountAmountCents: integer("discount_amount_cents").notNull(),
    /** Täielik DiscountSnapshot (sh ridade jaotus) */
    snapshot: jsonb("snapshot").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    confirmedAt: timestamp("confirmed_at", { withTimezone: true }),
    cancelledAt: timestamp("cancelled_at", { withTimezone: true }),
  },
  (t) => [
    uniqueIndex("discount_redemptions_order_uq").on(t.discountCodeId, t.orderId),
    index("discount_redemptions_code_status_idx").on(t.discountCodeId, t.status),
    inList("discount_redemptions_status_ck", "status", REDEMPTION_STATUSES),
  ],
);

/** Sooduskoodi kontrollimise katsed (piirang botide vastu). */
export const discountValidationAttempts = pgTable(
  "discount_validation_attempts",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    ip: text("ip").notNull(),
    success: boolean("success").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("discount_validation_attempts_ip_idx").on(t.ip, t.createdAt)],
);

// ---------------------------------------------------------------------------
// Tellimused (vt docs/ORDERS.md)
// ---------------------------------------------------------------------------

/** Tellimuse olekud. Selles faasis kasutatakse CREATED ja CANCELLED; ülejäänud on makse/tarne faaside jaoks. */
export const ORDER_STATUSES = ["CREATED", "AWAITING_PAYMENT", "PAID", "PROCESSING", "SHIPPED", "COMPLETED", "CANCELLED", "REFUNDED"] as const;
export const PAYMENT_STATUSES = ["NOT_STARTED", "PENDING", "PAID", "FAILED", "REFUNDED"] as const;
export const ORDER_HISTORY_SOURCES = ["CHECKOUT", "ADMIN", "SYSTEM", "PAYMENT"] as const;

export const orders = pgTable(
  "orders",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** Avalik tellimuse number, nt SL-26-A7K4P9 (mitte andmebaasi ID) */
    orderNumber: text("order_number").notNull(),
    /** Prototüübi testtellimus: makset ei võeta, tarnijale ei saadeta, laoseisu ei vähendata */
    isTest: boolean("is_test").notNull(),
    status: text("status", { enum: ORDER_STATUSES }).notNull().default("CREATED"),
    paymentStatus: text("payment_status", { enum: PAYMENT_STATUSES }).notNull().default("NOT_STARTED"),

    // Klient (snapshot — kliendikontot pole)
    customerEmail: text("customer_email").notNull(),
    customerFirstName: text("customer_first_name").notNull(),
    customerLastName: text("customer_last_name").notNull(),
    customerPhone: text("customer_phone").notNull(),
    companyName: text("company_name"),
    companyRegistryCode: text("company_registry_code"),
    companyVatNumber: text("company_vat_number"),

    // Tarne
    shippingMethodCode: text("shipping_method_code").notNull(),
    shippingMethodName: text("shipping_method_name").notNull(),
    shippingAddressLine1: text("shipping_address_line1").notNull(),
    shippingAddressLine2: text("shipping_address_line2"),
    shippingCity: text("shipping_city").notNull(),
    shippingPostalCode: text("shipping_postal_code").notNull(),
    /** ISO 3166-1 alpha-2, nt "EE" */
    shippingCountry: text("shipping_country").notNull(),

    // Summad sentides (serveris arvutatud)
    subtotalCents: integer("subtotal_cents").notNull(),
    discountAmountCents: integer("discount_amount_cents").notNull().default(0),
    shippingAmountCents: integer("shipping_amount_cents").notNull(),
    totalCents: integer("total_cents").notNull(),
    currency: text("currency").notNull().default("EUR"),

    // Sooduskoodi snapshot (tellimus ei sõltu hiljem discount_codes reast)
    discountCodeId: uuid("discount_code_id").references(() => discountCodes.id, { onDelete: "set null" }),
    discountCode: text("discount_code"),
    discountType: text("discount_type", { enum: DISCOUNT_TYPE_VALUES }),
    discountValue: integer("discount_value"),
    discountSnapshot: jsonb("discount_snapshot"),

    customerNote: text("customer_note"),

    /** SHA-256(checkoutAttemptId) — sama esitus ei loo kahte tellimust */
    idempotencyKeyHash: text("idempotency_key_hash").notNull(),
    /** SHA-256(juurdepääsutoken) — kinnituslehe juurdepääs (token on ainult kliendi httpOnly küpsises) */
    publicAccessTokenHash: text("public_access_token_hash").notNull(),

    ...timestamps,
    cancelledAt: timestamp("cancelled_at", { withTimezone: true }),
  },
  (t) => [
    uniqueIndex("orders_order_number_uq").on(t.orderNumber),
    uniqueIndex("orders_idempotency_uq").on(t.idempotencyKeyHash),
    index("orders_created_idx").on(t.createdAt),
    index("orders_email_idx").on(t.customerEmail),
    index("orders_status_idx").on(t.status, t.paymentStatus),
    inList("orders_status_ck", "status", ORDER_STATUSES),
    inList("orders_payment_status_ck", "payment_status", PAYMENT_STATUSES),
    check("orders_amounts_ck", sql`subtotal_cents >= 0 AND discount_amount_cents >= 0 AND shipping_amount_cents >= 0 AND total_cents >= 0 AND total_cents = subtotal_cents - discount_amount_cents + shipping_amount_cents`),
  ],
);

/** Tellimuse rida — SNAPSHOT ostu hetkest. Kuvamine ei sõltu hiljem kataloogist. */
export const orderItems = pgTable(
  "order_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orderId: uuid("order_id")
      .notNull()
      .references(() => orders.id, { onDelete: "cascade" }),
    position: integer("position").notNull(),
    /** Viited on valikulised (toode võidakse hiljem kustutada/arhiveerida) — kuvamiseks kasutatakse snapshot'i */
    productModelId: uuid("product_model_id").references(() => productModels.id, { onDelete: "set null" }),
    supplierListingId: uuid("supplier_listing_id").references(() => supplierListings.id, { onDelete: "set null" }),
    sku: text("sku").notNull(),
    manufacturer: text("manufacturer").notNull(),
    model: text("model").notNull(),
    title: text("title").notNull(),
    cpu: text("cpu"),
    cpuGeneration: text("cpu_generation"),
    ramGb: integer("ram_gb"),
    storageGb: integer("storage_gb"),
    gpu: text("gpu"),
    screen: text("screen"),
    keyboard: text("keyboard"),
    grade: text("grade"),
    /**
     * Käibemaksu režiim ostu hetkel (snapshot): STANDARD (hinnas täis-KM) | MARGIN (kasutatud kauba erikord, KMS §41 —
     * KM marginaalilt, mitte kogu hinnalt) | UNKNOWN. NULL = enne 2026-10-12 loodud rida. Arveldus/raamatupidamine loeb seda.
     */
    vatScheme: text("vat_scheme"),
    quantity: integer("quantity").notNull(),
    unitPriceCents: integer("unit_price_cents").notNull(),
    lineSubtotalCents: integer("line_subtotal_cents").notNull(),
    discountAmountCents: integer("discount_amount_cents").notNull().default(0),
    lineTotalCents: integer("line_total_cents").notNull(),
    imagePath: text("image_path"),
  },
  (t) => [
    index("order_items_order_idx").on(t.orderId, t.position),
    check("order_items_amounts_ck", sql`quantity > 0 AND unit_price_cents >= 0 AND line_subtotal_cents = unit_price_cents * quantity AND discount_amount_cents >= 0 AND line_total_cents = line_subtotal_cents - discount_amount_cents`),
  ],
);

/**
 * Tellimuse rea ↔ tarnija füüsilise seadme (seerianumbri) seos — AINULT admin. Admin määrab, milline konkreetne
 * seade tellimusele läheb (kogus 3 → 3 eri seadet). Kliendile (kinnitusleht, tellimuse otsing) seda ei näidata.
 * Selles faasis on see ainult märge: seadet ei reserveerita ega märgita müüduks (testtellimus ei kuluta laoseisu).
 * Päris makse faasis seotakse reserveerimine/kulutamine tehinguga (vt docs/TECH_SYNC.md).
 */
export const orderItemUnits = pgTable(
  "order_item_units",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orderItemId: uuid("order_item_id")
      .notNull()
      .references(() => orderItems.id, { onDelete: "cascade" }),
    inventoryUnitId: uuid("inventory_unit_id")
      .notNull()
      .references(() => supplierInventoryUnits.id, { onDelete: "restrict" }),
    adminUserId: uuid("admin_user_id").references(() => adminUsers.id, { onDelete: "set null" }),
    adminEmail: text("admin_email"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("order_item_units_uq").on(t.orderItemId, t.inventoryUnitId), index("order_item_units_unit_idx").on(t.inventoryUnitId)],
);

export const PROCUREMENT_STATUSES = ["TO_ORDER", "ORDERED", "SUPPLIER_SHIPPED", "RECEIVED"] as const;
export type ProcurementStatus = (typeof PROCUREMENT_STATUSES)[number];

/**
 * Tarnijalt käsitsi tellimise seis tellimuse rea kohta (nt Foxway). Luuakse tellimuse loomisel samas tehingus, kui
 * rida pärineb tarnijast, kellelt kaup tuleb eraldi tellida. Automaatset tarnija tellimust EI tehta — admin tellib
 * käsitsi (võib enne erihinda küsida) ja märgib siin seisu.
 *
 * Snapshot (tellimuse hetkel, ei muutu): tarnija, SKU, ItemVariantId, tarnija hinnakirja hind.
 * Muudetav (admin): seis, viide/märkus, kuupäevad, tegelik ostuhind (võib erineda hinnakirja hinnast — erihind).
 * Kliendi müügihind on order_items.unit_price_cents (snapshot).
 */
export const orderItemProcurements = pgTable(
  "order_item_procurements",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orderItemId: uuid("order_item_id")
      .notNull()
      .references(() => orderItems.id, { onDelete: "cascade" }),
    /** Tarnija kood, nt "foxway" */
    supplier: text("supplier").notNull(),
    /** Tarnija SKU (Foxway SKU) — sellega tellitakse */
    supplierSku: text("supplier_sku").notNull(),
    /** Foxway ItemVariantId (mudel/variant tarnija süsteemis) — viide, mitte identiteet */
    supplierVariantId: text("supplier_variant_id"),
    supplierProductName: text("supplier_product_name"),
    /** Tarnija hinnakirja hind tellimuse hetkel (ilma KM-ita), sentides */
    supplierListedPriceCents: integer("supplier_listed_price_cents"),
    supplierCurrency: text("supplier_currency"),
    /** Tarnija KM tüüp tellimuse hetkel (Foxway IsVatMargin): true = erikorra kaup, hinnakirja hind ilma KM lisandita */
    supplierVatMargin: boolean("supplier_vat_margin"),
    status: text("status", { enum: PROCUREMENT_STATUSES }).notNull().default("TO_ORDER"),
    /** Tarnija tellimuse number / viide */
    supplierOrderReference: text("supplier_order_reference"),
    note: text("note"),
    /** Tegelik ostuhind ühiku kohta (sentides, ilma KM-ita) — NULL kuni teada; võib erineda hinnakirja hinnast */
    actualPurchasePriceCents: integer("actual_purchase_price_cents"),
    /** Valikuline tarnija seerianumber (Foxway annab alles pärast tellimist) */
    supplierSerial: text("supplier_serial"),
    orderedAt: timestamp("ordered_at", { withTimezone: true }),
    supplierShippedAt: timestamp("supplier_shipped_at", { withTimezone: true }),
    receivedAt: timestamp("received_at", { withTimezone: true }),
    updatedBy: text("updated_by"),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("order_item_procurements_item_uq").on(t.orderItemId),
    index("order_item_procurements_status_idx").on(t.supplier, t.status),
    inList("order_item_procurements_status_ck", "status", PROCUREMENT_STATUSES),
    check("order_item_procurements_price_ck", sql`actual_purchase_price_cents IS NULL OR actual_purchase_price_cents >= 0`),
  ],
);

export const orderStatusHistory = pgTable(
  "order_status_history",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    orderId: uuid("order_id")
      .notNull()
      .references(() => orders.id, { onDelete: "cascade" }),
    /** ORDER = tellimuse olek, PAYMENT = makse olek */
    kind: text("kind", { enum: ["ORDER", "PAYMENT"] }).notNull().default("ORDER"),
    fromStatus: text("from_status"),
    toStatus: text("to_status").notNull(),
    source: text("source", { enum: ORDER_HISTORY_SOURCES }).notNull(),
    adminUserId: uuid("admin_user_id").references(() => adminUsers.id, { onDelete: "set null" }),
    adminEmail: text("admin_email"),
    note: text("note"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("order_status_history_order_idx").on(t.orderId, t.createdAt), inList("order_status_history_source_ck", "source", ORDER_HISTORY_SOURCES)],
);

/** Admini sisemärkmed (kliendile ei näidata). Ainult lisamine — muutmist ega kustutamist pole. */
export const orderInternalNotes = pgTable(
  "order_internal_notes",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    orderId: uuid("order_id")
      .notNull()
      .references(() => orders.id, { onDelete: "cascade" }),
    adminUserId: uuid("admin_user_id").references(() => adminUsers.id, { onDelete: "set null" }),
    adminEmail: text("admin_email"),
    note: text("note").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("order_internal_notes_order_idx").on(t.orderId, t.createdAt)],
);

/** Avaliku tellimuse otsingu katsed (piirang). */
export const orderLookupAttempts = pgTable(
  "order_lookup_attempts",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    ip: text("ip").notNull(),
    success: boolean("success").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("order_lookup_attempts_ip_idx").on(t.ip, t.createdAt)],
);

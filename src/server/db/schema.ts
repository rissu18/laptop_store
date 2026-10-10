import { sql } from "drizzle-orm";
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

export const CATALOG_STATUSES = ["ACTIVE", "HIDDEN", "ARCHIVED"] as const;
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
    stock: integer("stock"),
    deliveryMinDays: integer("delivery_min_days"),
    deliveryMaxDays: integer("delivery_max_days"),
    supplierPriceCents: integer("supplier_price_cents"),
    vatScheme: text("vat_scheme"),
    // Meie hind (hinnastamismootor / admin)
    salePriceCents: integer("sale_price_cents"),
    referencePriceCents: integer("reference_price_cents"),
    status: text("status", { enum: CATALOG_STATUSES }).notNull().default("ACTIVE"),
    manualOverrides: jsonb("manual_overrides").$type<Record<string, unknown>>().notNull().default({}),
    /** Tarnija toorandmed silumiseks — äriloogika neid ei loe */
    rawData: jsonb("raw_data"),
    firstSeenAt: timestamp("first_seen_at", { withTimezone: true }).notNull().defaultNow(),
    lastSyncedAt: timestamp("last_synced_at", { withTimezone: true }),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("supplier_listings_supplier_product_uq").on(t.supplier, t.supplierProductId),
    uniqueIndex("supplier_listings_sku_uq").on(t.sku),
    index("supplier_listings_model_idx").on(t.productModelId),
    index("supplier_listings_status_idx").on(t.status),
    statusCheck("supplier_listings_status_ck", "status"),
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
export const LOG_SOURCES = ["APPLICATION", "DATABASE", "ADMIN", "AUTH", "ICECAT"] as const;

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

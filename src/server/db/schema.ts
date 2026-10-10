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

CREATE TABLE "discount_codes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"normalized_code" text NOT NULL,
	"name" text NOT NULL,
	"internal_description" text,
	"type" text NOT NULL,
	"value" integer NOT NULL,
	"status" text DEFAULT 'DRAFT' NOT NULL,
	"active" boolean GENERATED ALWAYS AS (status = 'ACTIVE') STORED,
	"starts_at" timestamp with time zone,
	"expires_at" timestamp with time zone,
	"minimum_subtotal_cents" integer,
	"maximum_discount_cents" integer,
	"usage_limit" integer,
	"usage_count" integer DEFAULT 0 NOT NULL,
	"scope" text DEFAULT 'ALL_PRODUCTS' NOT NULL,
	"respect_minimum_margin" boolean DEFAULT true NOT NULL,
	"created_by" text,
	"updated_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "discount_codes_type_ck" CHECK (type in ('PERCENTAGE', 'FIXED_AMOUNT', 'FREE_SHIPPING')),
	CONSTRAINT "discount_codes_status_ck" CHECK (status in ('DRAFT', 'ACTIVE', 'DISABLED', 'ARCHIVED')),
	CONSTRAINT "discount_codes_scope_ck" CHECK (scope in ('ALL_PRODUCTS', 'SELECTED_MANUFACTURERS', 'SELECTED_PRODUCT_MODELS', 'SELECTED_LISTINGS')),
	CONSTRAINT "discount_codes_value_ck" CHECK (value >= 0 AND (type <> 'PERCENTAGE' OR value <= 10000)),
	CONSTRAINT "discount_codes_dates_ck" CHECK (expires_at IS NULL OR starts_at IS NULL OR expires_at > starts_at),
	CONSTRAINT "discount_codes_usage_ck" CHECK (usage_count >= 0 AND (usage_limit IS NULL OR usage_limit > 0))
);
--> statement-breakpoint
CREATE TABLE "discount_manufacturers" (
	"discount_code_id" uuid NOT NULL,
	"manufacturer" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "discount_product_models" (
	"discount_code_id" uuid NOT NULL,
	"product_model_id" uuid NOT NULL,
	"mode" text NOT NULL,
	CONSTRAINT "discount_product_models_mode_ck" CHECK (mode in ('INCLUDE', 'EXCLUDE'))
);
--> statement-breakpoint
CREATE TABLE "discount_redemptions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"discount_code_id" uuid NOT NULL,
	"order_id" uuid NOT NULL,
	"status" text DEFAULT 'PENDING' NOT NULL,
	"code_snapshot" text NOT NULL,
	"type_snapshot" text NOT NULL,
	"value_snapshot" integer NOT NULL,
	"discount_amount_cents" integer NOT NULL,
	"snapshot" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"confirmed_at" timestamp with time zone,
	"cancelled_at" timestamp with time zone,
	CONSTRAINT "discount_redemptions_status_ck" CHECK (status in ('PENDING', 'CONFIRMED', 'CANCELLED'))
);
--> statement-breakpoint
CREATE TABLE "discount_supplier_listings" (
	"discount_code_id" uuid NOT NULL,
	"supplier_listing_id" uuid NOT NULL,
	"mode" text NOT NULL,
	CONSTRAINT "discount_supplier_listings_mode_ck" CHECK (mode in ('INCLUDE', 'EXCLUDE'))
);
--> statement-breakpoint
CREATE TABLE "discount_validation_attempts" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"ip" text NOT NULL,
	"success" boolean NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "discount_manufacturers" ADD CONSTRAINT "discount_manufacturers_discount_code_id_discount_codes_id_fk" FOREIGN KEY ("discount_code_id") REFERENCES "public"."discount_codes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "discount_product_models" ADD CONSTRAINT "discount_product_models_discount_code_id_discount_codes_id_fk" FOREIGN KEY ("discount_code_id") REFERENCES "public"."discount_codes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "discount_product_models" ADD CONSTRAINT "discount_product_models_product_model_id_product_models_id_fk" FOREIGN KEY ("product_model_id") REFERENCES "public"."product_models"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "discount_redemptions" ADD CONSTRAINT "discount_redemptions_discount_code_id_discount_codes_id_fk" FOREIGN KEY ("discount_code_id") REFERENCES "public"."discount_codes"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "discount_supplier_listings" ADD CONSTRAINT "discount_supplier_listings_discount_code_id_discount_codes_id_fk" FOREIGN KEY ("discount_code_id") REFERENCES "public"."discount_codes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "discount_supplier_listings" ADD CONSTRAINT "discount_supplier_listings_supplier_listing_id_supplier_listings_id_fk" FOREIGN KEY ("supplier_listing_id") REFERENCES "public"."supplier_listings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "discount_codes_normalized_code_uq" ON "discount_codes" USING btree ("normalized_code");--> statement-breakpoint
CREATE INDEX "discount_codes_status_idx" ON "discount_codes" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "discount_manufacturers_uq" ON "discount_manufacturers" USING btree ("discount_code_id","manufacturer");--> statement-breakpoint
CREATE UNIQUE INDEX "discount_product_models_uq" ON "discount_product_models" USING btree ("discount_code_id","product_model_id","mode");--> statement-breakpoint
CREATE UNIQUE INDEX "discount_redemptions_order_uq" ON "discount_redemptions" USING btree ("discount_code_id","order_id");--> statement-breakpoint
CREATE INDEX "discount_redemptions_code_status_idx" ON "discount_redemptions" USING btree ("discount_code_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "discount_supplier_listings_uq" ON "discount_supplier_listings" USING btree ("discount_code_id","supplier_listing_id","mode");--> statement-breakpoint
CREATE INDEX "discount_validation_attempts_ip_idx" ON "discount_validation_attempts" USING btree ("ip","created_at");
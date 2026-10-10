CREATE TABLE "admin_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"token_hash" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ip" text,
	"user_agent" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "admin_users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"name" text NOT NULL,
	"password_hash" text NOT NULL,
	"role" text DEFAULT 'ADMIN' NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"last_login_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "audit_logs" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"admin_user_id" uuid,
	"admin_email" text,
	"action" text NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" text,
	"entity_label" text,
	"changes" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "icecat_metadata" (
	"product_model_id" uuid PRIMARY KEY NOT NULL,
	"status" text NOT NULL,
	"reason" text,
	"match_type" text,
	"confidence" numeric(3, 2),
	"icecat_id" text,
	"icecat_title" text,
	"matched_by" text,
	"title_verified" boolean,
	"image_count" integer DEFAULT 0 NOT NULL,
	"error" text,
	"checked_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "login_attempts" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"ip" text NOT NULL,
	"success" boolean NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pricing_rules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"from_cost_cents" integer NOT NULL,
	"to_cost_cents" integer,
	"markup_fixed_cents" integer DEFAULT 0 NOT NULL,
	"markup_percent_bps" integer DEFAULT 0 NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "product_identifiers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"product_model_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"value" text NOT NULL,
	"source" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "product_images" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"product_model_id" uuid NOT NULL,
	"source" text NOT NULL,
	"type" text NOT NULL,
	"source_id" text NOT NULL,
	"position" integer NOT NULL,
	"is_main" boolean DEFAULT false NOT NULL,
	"is_hidden" boolean DEFAULT false NOT NULL,
	"thumbnail_path" text NOT NULL,
	"medium_path" text NOT NULL,
	"large_path" text NOT NULL,
	"width" integer NOT NULL,
	"height" integer NOT NULL,
	"alt" text NOT NULL,
	"original_source_url" text,
	"source_updated_at" text,
	"content_hash" text,
	"storage_keys" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"downloaded_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "product_models" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"manufacturer" text NOT NULL,
	"family" text NOT NULL,
	"model" text NOT NULL,
	"generation" text,
	"screen_size_in" numeric(3, 1),
	"weight_kg" numeric(4, 2),
	"usb_a_ports" integer,
	"usb_c_ports" integer,
	"wifi" text,
	"bluetooth" text,
	"description" text,
	"featured" boolean DEFAULT false NOT NULL,
	"status" text DEFAULT 'ACTIVE' NOT NULL,
	"manual_overrides" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "product_models_status_ck" CHECK (status in ('ACTIVE', 'HIDDEN', 'ARCHIVED'))
);
--> statement-breakpoint
CREATE TABLE "store_settings" (
	"key" text PRIMARY KEY NOT NULL,
	"value" jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" text
);
--> statement-breakpoint
CREATE TABLE "supplier_listings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"product_model_id" uuid NOT NULL,
	"supplier" text NOT NULL,
	"supplier_sku" text,
	"supplier_product_id" text NOT NULL,
	"sku" text NOT NULL,
	"cpu" text,
	"cpu_family" text,
	"cpu_generation" text,
	"ram_gb" integer,
	"ram_type" text,
	"storage_gb" integer,
	"gpu" text,
	"gpu_dedicated" boolean,
	"screen_size_in" numeric(3, 1),
	"resolution" text,
	"resolution_label" text,
	"panel" text,
	"touchscreen" boolean,
	"keyboard" text,
	"grade" text,
	"features" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"operating_system" text,
	"warranty_months" integer,
	"battery_health_pct" integer,
	"charger_included" boolean,
	"stock" integer,
	"delivery_min_days" integer,
	"delivery_max_days" integer,
	"supplier_price_cents" integer,
	"vat_scheme" text,
	"sale_price_cents" integer,
	"reference_price_cents" integer,
	"status" text DEFAULT 'ACTIVE' NOT NULL,
	"manual_overrides" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"raw_data" jsonb,
	"first_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_synced_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "supplier_listings_status_ck" CHECK (status in ('ACTIVE', 'HIDDEN', 'ARCHIVED'))
);
--> statement-breakpoint
CREATE TABLE "system_logs" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"level" text NOT NULL,
	"source" text NOT NULL,
	"message" text NOT NULL,
	"details" jsonb,
	"error_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "admin_sessions" ADD CONSTRAINT "admin_sessions_user_id_admin_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."admin_users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_admin_user_id_admin_users_id_fk" FOREIGN KEY ("admin_user_id") REFERENCES "public"."admin_users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "icecat_metadata" ADD CONSTRAINT "icecat_metadata_product_model_id_product_models_id_fk" FOREIGN KEY ("product_model_id") REFERENCES "public"."product_models"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_identifiers" ADD CONSTRAINT "product_identifiers_product_model_id_product_models_id_fk" FOREIGN KEY ("product_model_id") REFERENCES "public"."product_models"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_images" ADD CONSTRAINT "product_images_product_model_id_product_models_id_fk" FOREIGN KEY ("product_model_id") REFERENCES "public"."product_models"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier_listings" ADD CONSTRAINT "supplier_listings_product_model_id_product_models_id_fk" FOREIGN KEY ("product_model_id") REFERENCES "public"."product_models"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "admin_sessions_token_uq" ON "admin_sessions" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "admin_sessions_user_idx" ON "admin_sessions" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "admin_users_email_uq" ON "admin_users" USING btree ("email");--> statement-breakpoint
CREATE INDEX "audit_logs_created_idx" ON "audit_logs" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "audit_logs_entity_idx" ON "audit_logs" USING btree ("entity_type","entity_id");--> statement-breakpoint
CREATE INDEX "icecat_metadata_status_idx" ON "icecat_metadata" USING btree ("status");--> statement-breakpoint
CREATE INDEX "login_attempts_email_idx" ON "login_attempts" USING btree ("email","created_at");--> statement-breakpoint
CREATE INDEX "login_attempts_ip_idx" ON "login_attempts" USING btree ("ip","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "product_identifiers_uq" ON "product_identifiers" USING btree ("product_model_id","kind","value");--> statement-breakpoint
CREATE UNIQUE INDEX "product_images_source_uq" ON "product_images" USING btree ("product_model_id","source","source_id");--> statement-breakpoint
CREATE INDEX "product_images_model_idx" ON "product_images" USING btree ("product_model_id","position");--> statement-breakpoint
CREATE UNIQUE INDEX "product_models_slug_uq" ON "product_models" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "product_models_status_idx" ON "product_models" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "supplier_listings_supplier_product_uq" ON "supplier_listings" USING btree ("supplier","supplier_product_id");--> statement-breakpoint
CREATE UNIQUE INDEX "supplier_listings_sku_uq" ON "supplier_listings" USING btree ("sku");--> statement-breakpoint
CREATE INDEX "supplier_listings_model_idx" ON "supplier_listings" USING btree ("product_model_id");--> statement-breakpoint
CREATE INDEX "supplier_listings_status_idx" ON "supplier_listings" USING btree ("status");--> statement-breakpoint
CREATE INDEX "system_logs_created_idx" ON "system_logs" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "system_logs_level_idx" ON "system_logs" USING btree ("level","source");
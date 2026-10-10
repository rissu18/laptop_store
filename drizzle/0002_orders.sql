CREATE TABLE "order_internal_notes" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"order_id" uuid NOT NULL,
	"admin_user_id" uuid,
	"admin_email" text,
	"note" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "order_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" uuid NOT NULL,
	"position" integer NOT NULL,
	"product_model_id" uuid,
	"supplier_listing_id" uuid,
	"sku" text NOT NULL,
	"manufacturer" text NOT NULL,
	"model" text NOT NULL,
	"title" text NOT NULL,
	"cpu" text,
	"cpu_generation" text,
	"ram_gb" integer,
	"storage_gb" integer,
	"gpu" text,
	"screen" text,
	"keyboard" text,
	"grade" text,
	"quantity" integer NOT NULL,
	"unit_price_cents" integer NOT NULL,
	"line_subtotal_cents" integer NOT NULL,
	"discount_amount_cents" integer DEFAULT 0 NOT NULL,
	"line_total_cents" integer NOT NULL,
	"image_path" text,
	CONSTRAINT "order_items_amounts_ck" CHECK (quantity > 0 AND unit_price_cents >= 0 AND line_subtotal_cents = unit_price_cents * quantity AND discount_amount_cents >= 0 AND line_total_cents = line_subtotal_cents - discount_amount_cents)
);
--> statement-breakpoint
CREATE TABLE "order_lookup_attempts" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"ip" text NOT NULL,
	"success" boolean NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "order_status_history" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"order_id" uuid NOT NULL,
	"kind" text DEFAULT 'ORDER' NOT NULL,
	"from_status" text,
	"to_status" text NOT NULL,
	"source" text NOT NULL,
	"admin_user_id" uuid,
	"admin_email" text,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "order_status_history_source_ck" CHECK (source in ('CHECKOUT', 'ADMIN', 'SYSTEM', 'PAYMENT'))
);
--> statement-breakpoint
CREATE TABLE "orders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_number" text NOT NULL,
	"is_test" boolean NOT NULL,
	"status" text DEFAULT 'CREATED' NOT NULL,
	"payment_status" text DEFAULT 'NOT_STARTED' NOT NULL,
	"customer_email" text NOT NULL,
	"customer_first_name" text NOT NULL,
	"customer_last_name" text NOT NULL,
	"customer_phone" text NOT NULL,
	"company_name" text,
	"company_registry_code" text,
	"company_vat_number" text,
	"shipping_method_code" text NOT NULL,
	"shipping_method_name" text NOT NULL,
	"shipping_address_line1" text NOT NULL,
	"shipping_address_line2" text,
	"shipping_city" text NOT NULL,
	"shipping_postal_code" text NOT NULL,
	"shipping_country" text NOT NULL,
	"subtotal_cents" integer NOT NULL,
	"discount_amount_cents" integer DEFAULT 0 NOT NULL,
	"shipping_amount_cents" integer NOT NULL,
	"total_cents" integer NOT NULL,
	"currency" text DEFAULT 'EUR' NOT NULL,
	"discount_code_id" uuid,
	"discount_code" text,
	"discount_type" text,
	"discount_value" integer,
	"discount_snapshot" jsonb,
	"customer_note" text,
	"idempotency_key_hash" text NOT NULL,
	"public_access_token_hash" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"cancelled_at" timestamp with time zone,
	CONSTRAINT "orders_status_ck" CHECK (status in ('CREATED', 'AWAITING_PAYMENT', 'PAID', 'PROCESSING', 'SHIPPED', 'COMPLETED', 'CANCELLED', 'REFUNDED')),
	CONSTRAINT "orders_payment_status_ck" CHECK (payment_status in ('NOT_STARTED', 'PENDING', 'PAID', 'FAILED', 'REFUNDED')),
	CONSTRAINT "orders_amounts_ck" CHECK (subtotal_cents >= 0 AND discount_amount_cents >= 0 AND shipping_amount_cents >= 0 AND total_cents >= 0 AND total_cents = subtotal_cents - discount_amount_cents + shipping_amount_cents)
);
--> statement-breakpoint
ALTER TABLE "order_internal_notes" ADD CONSTRAINT "order_internal_notes_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_internal_notes" ADD CONSTRAINT "order_internal_notes_admin_user_id_admin_users_id_fk" FOREIGN KEY ("admin_user_id") REFERENCES "public"."admin_users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_product_model_id_product_models_id_fk" FOREIGN KEY ("product_model_id") REFERENCES "public"."product_models"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_supplier_listing_id_supplier_listings_id_fk" FOREIGN KEY ("supplier_listing_id") REFERENCES "public"."supplier_listings"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_status_history" ADD CONSTRAINT "order_status_history_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_status_history" ADD CONSTRAINT "order_status_history_admin_user_id_admin_users_id_fk" FOREIGN KEY ("admin_user_id") REFERENCES "public"."admin_users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_discount_code_id_discount_codes_id_fk" FOREIGN KEY ("discount_code_id") REFERENCES "public"."discount_codes"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "order_internal_notes_order_idx" ON "order_internal_notes" USING btree ("order_id","created_at");--> statement-breakpoint
CREATE INDEX "order_items_order_idx" ON "order_items" USING btree ("order_id","position");--> statement-breakpoint
CREATE INDEX "order_lookup_attempts_ip_idx" ON "order_lookup_attempts" USING btree ("ip","created_at");--> statement-breakpoint
CREATE INDEX "order_status_history_order_idx" ON "order_status_history" USING btree ("order_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "orders_order_number_uq" ON "orders" USING btree ("order_number");--> statement-breakpoint
CREATE UNIQUE INDEX "orders_idempotency_uq" ON "orders" USING btree ("idempotency_key_hash");--> statement-breakpoint
CREATE INDEX "orders_created_idx" ON "orders" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "orders_email_idx" ON "orders" USING btree ("customer_email");--> statement-breakpoint
CREATE INDEX "orders_status_idx" ON "orders" USING btree ("status","payment_status");--> statement-breakpoint
ALTER TABLE "discount_redemptions" ADD CONSTRAINT "discount_redemptions_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE restrict ON UPDATE no action;
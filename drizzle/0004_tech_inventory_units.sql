CREATE TABLE "order_item_units" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_item_id" uuid NOT NULL,
	"inventory_unit_id" uuid NOT NULL,
	"admin_user_id" uuid,
	"admin_email" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "supplier_inventory_units" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"supplier" text NOT NULL,
	"external_unit_id" text NOT NULL,
	"serial_number" text,
	"supplier_listing_id" uuid,
	"available" boolean DEFAULT false NOT NULL,
	"status" text NOT NULL,
	"sold_by_color" boolean DEFAULT false NOT NULL,
	"excluded_reason" text,
	"source_sheet" text,
	"source_row" integer,
	"raw_data" jsonb,
	"first_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "supplier_inventory_units_status_ck" CHECK (status in ('AVAILABLE', 'SOLD', 'NOT_LAPTOP', 'INVALID', 'DEFECT', 'UNKNOWN_NOTE', 'CONFLICT', 'MISSING'))
);
--> statement-breakpoint
ALTER TABLE "order_item_units" ADD CONSTRAINT "order_item_units_order_item_id_order_items_id_fk" FOREIGN KEY ("order_item_id") REFERENCES "public"."order_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_item_units" ADD CONSTRAINT "order_item_units_inventory_unit_id_supplier_inventory_units_id_fk" FOREIGN KEY ("inventory_unit_id") REFERENCES "public"."supplier_inventory_units"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_item_units" ADD CONSTRAINT "order_item_units_admin_user_id_admin_users_id_fk" FOREIGN KEY ("admin_user_id") REFERENCES "public"."admin_users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier_inventory_units" ADD CONSTRAINT "supplier_inventory_units_supplier_listing_id_supplier_listings_id_fk" FOREIGN KEY ("supplier_listing_id") REFERENCES "public"."supplier_listings"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "order_item_units_uq" ON "order_item_units" USING btree ("order_item_id","inventory_unit_id");--> statement-breakpoint
CREATE INDEX "order_item_units_unit_idx" ON "order_item_units" USING btree ("inventory_unit_id");--> statement-breakpoint
CREATE UNIQUE INDEX "supplier_inventory_units_supplier_unit_uq" ON "supplier_inventory_units" USING btree ("supplier","external_unit_id");--> statement-breakpoint
CREATE INDEX "supplier_inventory_units_listing_idx" ON "supplier_inventory_units" USING btree ("supplier_listing_id","available");
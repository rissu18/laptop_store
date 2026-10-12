CREATE TABLE "order_item_procurements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_item_id" uuid NOT NULL,
	"supplier" text NOT NULL,
	"supplier_sku" text NOT NULL,
	"supplier_variant_id" text,
	"supplier_product_name" text,
	"supplier_listed_price_cents" integer,
	"supplier_currency" text,
	"status" text DEFAULT 'TO_ORDER' NOT NULL,
	"supplier_order_reference" text,
	"note" text,
	"actual_purchase_price_cents" integer,
	"supplier_serial" text,
	"ordered_at" timestamp with time zone,
	"supplier_shipped_at" timestamp with time zone,
	"received_at" timestamp with time zone,
	"updated_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "order_item_procurements_status_ck" CHECK (status in ('TO_ORDER', 'ORDERED', 'SUPPLIER_SHIPPED', 'RECEIVED')),
	CONSTRAINT "order_item_procurements_price_ck" CHECK (actual_purchase_price_cents IS NULL OR actual_purchase_price_cents >= 0)
);
--> statement-breakpoint
ALTER TABLE "supplier_listings" ADD COLUMN "supplier_vat_margin" boolean;--> statement-breakpoint
ALTER TABLE "supplier_listings" ADD COLUMN "quality_hold" text;--> statement-breakpoint
ALTER TABLE "supplier_listings" ADD COLUMN "quality_hold_reason" text;--> statement-breakpoint
ALTER TABLE "order_item_procurements" ADD CONSTRAINT "order_item_procurements_order_item_id_order_items_id_fk" FOREIGN KEY ("order_item_id") REFERENCES "public"."order_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "order_item_procurements_item_uq" ON "order_item_procurements" USING btree ("order_item_id");--> statement-breakpoint
CREATE INDEX "order_item_procurements_status_idx" ON "order_item_procurements" USING btree ("supplier","status");--> statement-breakpoint
ALTER TABLE "supplier_listings" ADD CONSTRAINT "supplier_listings_quality_hold_ck" CHECK (quality_hold IS NULL OR quality_hold in ('REVIEW', 'BLOCKED'));
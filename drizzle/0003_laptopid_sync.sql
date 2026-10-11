CREATE TABLE "catalog_sync_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source" text NOT NULL,
	"status" text NOT NULL,
	"trigger" text NOT NULL,
	"triggered_by" text,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"lease_until" timestamp with time zone NOT NULL,
	"finished_at" timestamp with time zone,
	"stats" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"snapshot_trusted" boolean,
	"error" text,
	CONSTRAINT "catalog_sync_runs_status_ck" CHECK (status in ('RUNNING', 'SUCCESS', 'FAILED'))
);
--> statement-breakpoint
CREATE TABLE "listing_images" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"supplier_listing_id" uuid NOT NULL,
	"source" text NOT NULL,
	"source_id" text NOT NULL,
	"position" integer NOT NULL,
	"is_hidden" boolean DEFAULT false NOT NULL,
	"thumbnail_url" text NOT NULL,
	"medium_url" text NOT NULL,
	"large_url" text NOT NULL,
	"width" integer NOT NULL,
	"height" integer NOT NULL,
	"alt" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "supplier_listings" ADD COLUMN "available" boolean;--> statement-breakpoint
ALTER TABLE "supplier_listings" ADD COLUMN "price_source" text DEFAULT 'PRICING' NOT NULL;--> statement-breakpoint
ALTER TABLE "supplier_listings" ADD COLUMN "weight_kg" numeric(4, 2);--> statement-breakpoint
ALTER TABLE "supplier_listings" ADD COLUMN "condition_notes" text;--> statement-breakpoint
ALTER TABLE "supplier_listings" ADD COLUMN "details" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "supplier_listings" ADD COLUMN "last_seen_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "listing_images" ADD CONSTRAINT "listing_images_supplier_listing_id_supplier_listings_id_fk" FOREIGN KEY ("supplier_listing_id") REFERENCES "public"."supplier_listings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "catalog_sync_runs_running_uq" ON "catalog_sync_runs" USING btree ("source") WHERE status = 'RUNNING';--> statement-breakpoint
CREATE INDEX "catalog_sync_runs_source_idx" ON "catalog_sync_runs" USING btree ("source","started_at");--> statement-breakpoint
CREATE UNIQUE INDEX "listing_images_source_uq" ON "listing_images" USING btree ("supplier_listing_id","source","source_id");--> statement-breakpoint
CREATE INDEX "listing_images_listing_idx" ON "listing_images" USING btree ("supplier_listing_id","position");--> statement-breakpoint
ALTER TABLE "supplier_listings" ADD CONSTRAINT "supplier_listings_price_source_ck" CHECK (price_source in ('PRICING', 'SUPPLIER'));
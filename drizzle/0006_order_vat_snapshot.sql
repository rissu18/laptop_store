ALTER TABLE "order_item_procurements" ADD COLUMN "supplier_vat_margin" boolean;--> statement-breakpoint
ALTER TABLE "order_items" ADD COLUMN "vat_scheme" text;
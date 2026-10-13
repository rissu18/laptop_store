ALTER TABLE "listing_images" ADD COLUMN "visual_hash" text;--> statement-breakpoint
ALTER TABLE "listing_images" ADD COLUMN "image_quality" text;--> statement-breakpoint
ALTER TABLE "listing_images" ADD COLUMN "analyzed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "product_images" ADD COLUMN "visual_hash" text;--> statement-breakpoint
ALTER TABLE "product_images" ADD COLUMN "image_quality" text;--> statement-breakpoint
ALTER TABLE "product_images" ADD COLUMN "analyzed_at" timestamp with time zone;
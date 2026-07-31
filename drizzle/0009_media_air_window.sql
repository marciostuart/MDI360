ALTER TABLE "media_assets" ADD COLUMN IF NOT EXISTS "air_start_at" timestamp with time zone;
--> statement-breakpoint
ALTER TABLE "media_assets" ADD COLUMN IF NOT EXISTS "air_end_at" timestamp with time zone;

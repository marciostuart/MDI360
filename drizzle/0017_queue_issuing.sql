ALTER TABLE "queue_sectors" ADD COLUMN IF NOT EXISTS "issuing_enabled" boolean DEFAULT true NOT NULL;
--> statement-breakpoint
ALTER TABLE "queue_panels" ADD COLUMN IF NOT EXISTS "issuing_enabled" boolean DEFAULT true NOT NULL;

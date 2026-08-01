ALTER TABLE "queue_panels" ADD COLUMN IF NOT EXISTS "last_priority_number" integer DEFAULT 0 NOT NULL;
--> statement-breakpoint
ALTER TABLE "queue_sectors" ADD COLUMN IF NOT EXISTS "last_priority_number" integer DEFAULT 0 NOT NULL;

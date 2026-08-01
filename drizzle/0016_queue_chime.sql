ALTER TABLE "queue_panels" ADD COLUMN IF NOT EXISTS "chime_storage_key" text;
--> statement-breakpoint
ALTER TABLE "queue_panels" ADD COLUMN IF NOT EXISTS "chime_name" text;
--> statement-breakpoint
ALTER TABLE "queue_panels" ADD COLUMN IF NOT EXISTS "chime_volume" integer DEFAULT 55 NOT NULL;
--> statement-breakpoint
ALTER TABLE "queue_panels" ADD COLUMN IF NOT EXISTS "voice_volume" integer DEFAULT 200 NOT NULL;

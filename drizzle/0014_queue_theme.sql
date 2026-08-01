ALTER TABLE "queue_panels" ADD COLUMN IF NOT EXISTS "theme_bg_color" text DEFAULT '#000000' NOT NULL;
--> statement-breakpoint
ALTER TABLE "queue_panels" ADD COLUMN IF NOT EXISTS "theme_bg_media_id" uuid REFERENCES "media_assets"("id") ON DELETE set null;
--> statement-breakpoint
ALTER TABLE "queue_panels" ADD COLUMN IF NOT EXISTS "theme_ticket_color" text DEFAULT '#ffffff' NOT NULL;
--> statement-breakpoint
ALTER TABLE "queue_panels" ADD COLUMN IF NOT EXISTS "theme_text_color" text DEFAULT '#38bdf8' NOT NULL;
--> statement-breakpoint
ALTER TABLE "queue_panels" ADD COLUMN IF NOT EXISTS "theme_history_color" text DEFAULT '#ffffff' NOT NULL;

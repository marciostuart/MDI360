ALTER TABLE "queue_panels" ADD COLUMN IF NOT EXISTS "kiosk_bg_color" text DEFAULT '#0b1220' NOT NULL;
--> statement-breakpoint
ALTER TABLE "queue_panels" ADD COLUMN IF NOT EXISTS "kiosk_bg_media_id" uuid REFERENCES "media_assets"("id") ON DELETE set null;
--> statement-breakpoint
ALTER TABLE "queue_panels" ADD COLUMN IF NOT EXISTS "kiosk_card_color" text DEFAULT '#111a2e' NOT NULL;
--> statement-breakpoint
ALTER TABLE "queue_panels" ADD COLUMN IF NOT EXISTS "kiosk_title_color" text DEFAULT '#ffffff' NOT NULL;
--> statement-breakpoint
ALTER TABLE "queue_panels" ADD COLUMN IF NOT EXISTS "kiosk_text_color" text DEFAULT '#cbd5f5' NOT NULL;
--> statement-breakpoint
ALTER TABLE "queue_panels" ADD COLUMN IF NOT EXISTS "kiosk_normal_button_color" text DEFAULT '#2563eb' NOT NULL;
--> statement-breakpoint
ALTER TABLE "queue_panels" ADD COLUMN IF NOT EXISTS "kiosk_normal_button_text_color" text DEFAULT '#ffffff' NOT NULL;
--> statement-breakpoint
ALTER TABLE "queue_panels" ADD COLUMN IF NOT EXISTS "kiosk_priority_button_color" text DEFAULT '#f59e0b' NOT NULL;
--> statement-breakpoint
ALTER TABLE "queue_panels" ADD COLUMN IF NOT EXISTS "kiosk_priority_button_text_color" text DEFAULT '#0b1220' NOT NULL;
--> statement-breakpoint
ALTER TABLE "queue_panels" ADD COLUMN IF NOT EXISTS "kiosk_title" text;
--> statement-breakpoint
ALTER TABLE "queue_panels" ADD COLUMN IF NOT EXISTS "kiosk_show_logo" boolean DEFAULT true NOT NULL;

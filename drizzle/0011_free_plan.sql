ALTER TABLE "plans" ADD COLUMN IF NOT EXISTS "queue_enabled" boolean DEFAULT true NOT NULL;
--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN IF NOT EXISTS "queue_enabled_override" boolean;
--> statement-breakpoint
INSERT INTO "plans" ("name", "slug", "max_devices", "max_storage_mb", "price_cents", "queue_enabled", "is_active")
VALUES ('Gratuito', 'gratuito', 1, 4096, 0, false, true)
ON CONFLICT ("slug") DO NOTHING;

ALTER TABLE "queue_panels"
  ADD COLUMN IF NOT EXISTS "theme_layout" jsonb NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE "queue_panels"
  ADD COLUMN IF NOT EXISTS "kiosk_layout" jsonb NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE "queue_panels"
  ADD COLUMN IF NOT EXISTS "theme_overlay_start_color" text NOT NULL DEFAULT '#000000',
  ADD COLUMN IF NOT EXISTS "theme_overlay_start_from" integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "theme_overlay_start_to" integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "theme_overlay_end_color" text NOT NULL DEFAULT '#000000',
  ADD COLUMN IF NOT EXISTS "theme_overlay_end_from" integer NOT NULL DEFAULT 100,
  ADD COLUMN IF NOT EXISTS "theme_overlay_end_to" integer NOT NULL DEFAULT 100,
  ADD COLUMN IF NOT EXISTS "theme_overlay_angle" integer NOT NULL DEFAULT 135;

UPDATE "queue_panels"
SET
  "theme_overlay_start_color" = "theme_overlay_color",
  "theme_overlay_end_color" = "theme_overlay_color"
WHERE "theme_overlay_gradient" = true;

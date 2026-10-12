ALTER TABLE "queue_panels"
  ADD COLUMN IF NOT EXISTS "theme_image_key" text,
  ADD COLUMN IF NOT EXISTS "theme_overlay_color" text NOT NULL DEFAULT '#000000',
  ADD COLUMN IF NOT EXISTS "theme_overlay_opacity" integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "theme_overlay_gradient" boolean NOT NULL DEFAULT false;

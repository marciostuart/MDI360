ALTER TABLE "organizations"
  ADD COLUMN IF NOT EXISTS "brand_activation_style" jsonb NOT NULL DEFAULT '{}'::jsonb;

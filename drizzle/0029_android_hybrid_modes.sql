ALTER TABLE "devices"
ADD COLUMN IF NOT EXISTS "enabled_modes" jsonb NOT NULL DEFAULT '["display"]'::jsonb;

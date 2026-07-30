ALTER TABLE "organizations" ADD COLUMN IF NOT EXISTS "brand_logo_key" text;
ALTER TABLE "organizations" ADD COLUMN IF NOT EXISTS "brand_splash_text" text;
ALTER TABLE "organizations" ADD COLUMN IF NOT EXISTS "brand_color" text;

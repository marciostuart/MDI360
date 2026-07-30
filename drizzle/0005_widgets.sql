ALTER TYPE "public"."media_kind" ADD VALUE IF NOT EXISTS 'widget';--> statement-breakpoint
ALTER TABLE "media_assets" ADD COLUMN IF NOT EXISTS "widget_type" text;--> statement-breakpoint
ALTER TABLE "media_assets" ADD COLUMN IF NOT EXISTS "widget_config" jsonb;

CREATE TYPE "public"."media_status" AS ENUM('uploading', 'ready', 'failed');--> statement-breakpoint
ALTER TABLE "devices" ADD COLUMN "canvas_preset" text DEFAULT 'landscape-fhd' NOT NULL;--> statement-breakpoint
ALTER TABLE "media_assets" ADD COLUMN "status" "media_status" DEFAULT 'uploading' NOT NULL;--> statement-breakpoint
ALTER TABLE "media_assets" ADD COLUMN "canvas_preset" text DEFAULT 'landscape-fhd' NOT NULL;--> statement-breakpoint
ALTER TABLE "media_assets" ADD COLUMN "original_byte_size" integer;
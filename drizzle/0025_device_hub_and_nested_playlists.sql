ALTER TABLE "organizations" ADD COLUMN IF NOT EXISTS "alert_whatsapp" text;
ALTER TABLE "organizations" ADD COLUMN IF NOT EXISTS "alert_whatsapp_verified_at" timestamp with time zone;

ALTER TABLE "devices" ADD COLUMN IF NOT EXISTS "operating_hours" jsonb NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE "devices" ADD COLUMN IF NOT EXISTS "offline_alerts_enabled" boolean NOT NULL DEFAULT false;
ALTER TABLE "devices" ADD COLUMN IF NOT EXISTS "recovery_alerts_enabled" boolean NOT NULL DEFAULT true;
ALTER TABLE "devices" ADD COLUMN IF NOT EXISTS "offline_tolerance_minutes" smallint NOT NULL DEFAULT 5;
ALTER TABLE "devices" ADD COLUMN IF NOT EXISTS "alert_whatsapp" text;
ALTER TABLE "devices" ADD COLUMN IF NOT EXISTS "alert_whatsapp_verified_at" timestamp with time zone;
ALTER TABLE "devices" ADD COLUMN IF NOT EXISTS "offline_alert_sent_at" timestamp with time zone;

ALTER TABLE "playlist_items" ALTER COLUMN "media_asset_id" DROP NOT NULL;
ALTER TABLE "playlist_items" ADD COLUMN IF NOT EXISTS "nested_playlist_id" uuid;
ALTER TABLE "playlist_items" ADD COLUMN IF NOT EXISTS "schedule_rules" jsonb NOT NULL DEFAULT '[]'::jsonb;
DO $$ BEGIN
  ALTER TABLE "playlist_items" ADD CONSTRAINT "playlist_items_nested_playlist_id_playlists_id_fk"
    FOREIGN KEY ("nested_playlist_id") REFERENCES "playlists"("id") ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "playlist_items" ADD CONSTRAINT "playlist_items_exactly_one_target_check"
    CHECK (("media_asset_id" IS NOT NULL) <> ("nested_playlist_id" IS NOT NULL));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE "schedules" ADD COLUMN IF NOT EXISTS "rule_type" text NOT NULL DEFAULT 'weekly_time';
ALTER TABLE "schedules" ADD COLUMN IF NOT EXISTS "rule_config" jsonb NOT NULL DEFAULT '{}'::jsonb;

CREATE TABLE IF NOT EXISTS "whatsapp_verifications" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "organization_id" uuid NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
  "device_id" uuid REFERENCES "devices"("id") ON DELETE CASCADE,
  "phone" text NOT NULL,
  "code_hash" text NOT NULL,
  "expires_at" timestamp with time zone NOT NULL,
  "attempts" smallint NOT NULL DEFAULT 0,
  "verified_at" timestamp with time zone,
  "created_at" timestamp with time zone NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "whatsapp_verifications_org_phone_idx"
  ON "whatsapp_verifications" ("organization_id", "phone");

CREATE TABLE IF NOT EXISTS "device_notification_logs" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "organization_id" uuid NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
  "device_id" uuid NOT NULL REFERENCES "devices"("id") ON DELETE CASCADE,
  "kind" text NOT NULL,
  "recipient" text NOT NULL,
  "status" text NOT NULL DEFAULT 'pending',
  "error" text,
  "sent_at" timestamp with time zone,
  "created_at" timestamp with time zone NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "device_notification_logs_device_idx"
  ON "device_notification_logs" ("device_id", "created_at");

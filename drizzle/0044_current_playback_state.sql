ALTER TABLE "devices" ADD COLUMN IF NOT EXISTS "current_playlist_id" uuid;
ALTER TABLE "devices" ADD COLUMN IF NOT EXISTS "current_playlist_name" text;
ALTER TABLE "devices" ADD COLUMN IF NOT EXISTS "current_media_asset_id" uuid;
ALTER TABLE "devices" ADD COLUMN IF NOT EXISTS "current_media_name" text;
ALTER TABLE "devices" ADD COLUMN IF NOT EXISTS "current_media_kind" text;
ALTER TABLE "devices" ADD COLUMN IF NOT EXISTS "current_playback_started_at" timestamptz;

ALTER TABLE "devices" ADD COLUMN IF NOT EXISTS "current_playlist_item_id" uuid;
ALTER TABLE "devices" ADD COLUMN IF NOT EXISTS "current_playback_ended_at" timestamptz;

ALTER TABLE "playback_events" ADD COLUMN IF NOT EXISTS "playlist_item_id" uuid;
ALTER TABLE "playback_events" ADD COLUMN IF NOT EXISTS "ended_at" timestamptz;

CREATE INDEX IF NOT EXISTS "playback_events_playlist_item_idx"
  ON "playback_events" ("playlist_item_id", "started_at");

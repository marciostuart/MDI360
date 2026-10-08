ALTER TABLE "playback_events" ADD COLUMN IF NOT EXISTS "media_name" text;
ALTER TABLE "playback_events" ADD COLUMN IF NOT EXISTS "playlist_name" text;

UPDATE "playback_events" AS e
SET "media_name" = a."name"
FROM "media_assets" AS a
WHERE e."media_asset_id" = a."id" AND e."media_name" IS NULL;

UPDATE "playback_events" AS e
SET "playlist_name" = p."name"
FROM "playlists" AS p
WHERE e."playlist_id" = p."id" AND e."playlist_name" IS NULL;

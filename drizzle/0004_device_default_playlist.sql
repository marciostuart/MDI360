ALTER TABLE "devices" ADD COLUMN IF NOT EXISTS "default_playlist_id" uuid;

DO $$ BEGIN
  ALTER TABLE "devices"
    ADD CONSTRAINT "devices_default_playlist_id_playlists_id_fk"
    FOREIGN KEY ("default_playlist_id") REFERENCES "playlists"("id") ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE "devices" ADD COLUMN IF NOT EXISTS "audio_enabled" boolean DEFAULT true NOT NULL;

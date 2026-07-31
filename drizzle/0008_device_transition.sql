ALTER TABLE "devices" ADD COLUMN IF NOT EXISTS "transition_effect" text DEFAULT 'none' NOT NULL;

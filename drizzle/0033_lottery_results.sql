CREATE TABLE IF NOT EXISTS "lottery_results" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "game_id" text NOT NULL,
  "contest_number" integer NOT NULL,
  "draw_date" text NOT NULL,
  "payload" jsonb NOT NULL,
  "source_url" text NOT NULL,
  "confirmed_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS "lottery_results_game_contest_unique"
  ON "lottery_results" USING btree ("game_id", "contest_number");
CREATE INDEX IF NOT EXISTS "lottery_results_game_confirmed_idx"
  ON "lottery_results" USING btree ("game_id", "confirmed_at");

CREATE TABLE IF NOT EXISTS "lottery_sync_state" (
  "id" text PRIMARY KEY DEFAULT 'caixa' NOT NULL,
  "last_attempt_at" timestamp with time zone,
  "last_success_at" timestamp with time zone,
  "last_error" text,
  "lease_until" timestamp with time zone,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
INSERT INTO "lottery_sync_state" ("id") VALUES ('caixa') ON CONFLICT ("id") DO NOTHING;

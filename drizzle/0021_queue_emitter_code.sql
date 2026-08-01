ALTER TABLE "queue_panels" ADD COLUMN IF NOT EXISTS "emitter_code" text;
--> statement-breakpoint
UPDATE "queue_panels"
SET "emitter_code" = upper(substr(translate(encode(gen_random_bytes(16), 'hex'), 'abcdef01', 'ABCDEF79'), 1, 6))
WHERE "emitter_code" IS NULL;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "queue_panels_emitter_code_idx" ON "queue_panels" ("emitter_code");

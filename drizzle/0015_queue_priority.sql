ALTER TABLE "queue_panels" ADD COLUMN IF NOT EXISTS "numbering_scope" text DEFAULT 'sector' NOT NULL;
--> statement-breakpoint
ALTER TABLE "queue_panels" ADD COLUMN IF NOT EXISTS "priority_policy" text DEFAULT 'priority' NOT NULL;
--> statement-breakpoint
ALTER TABLE "queue_panels" ADD COLUMN IF NOT EXISTS "last_called_kind" text DEFAULT 'normal' NOT NULL;
--> statement-breakpoint
ALTER TABLE "queue_panels" ADD COLUMN IF NOT EXISTS "priority_prefix" text;
--> statement-breakpoint
ALTER TABLE "queue_panels" ADD COLUMN IF NOT EXISTS "kiosk_token" text;
--> statement-breakpoint
UPDATE "queue_panels" SET "kiosk_token" = replace(gen_random_uuid()::text, '-', '') WHERE "kiosk_token" IS NULL;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "queue_panels_kiosk_token_unique" ON "queue_panels" ("kiosk_token");
--> statement-breakpoint
ALTER TABLE "queue_calls" ADD COLUMN IF NOT EXISTS "kind" text DEFAULT 'normal' NOT NULL;
--> statement-breakpoint
ALTER TABLE "queue_calls" ADD COLUMN IF NOT EXISTS "ticket_id" uuid;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "queue_operators" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "panel_id" uuid NOT NULL REFERENCES "queue_panels"("id") ON DELETE cascade,
  "name" text NOT NULL DEFAULT 'Operador',
  "username" text NOT NULL,
  "password_hash" text NOT NULL,
  "is_enabled" boolean NOT NULL DEFAULT true,
  "created_at" timestamp with time zone NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "queue_operators_username_unique" ON "queue_operators" ("username");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "queue_operators_panel_idx" ON "queue_operators" ("panel_id");
--> statement-breakpoint
INSERT INTO "queue_operators" ("panel_id", "name", "username", "password_hash", "is_enabled")
SELECT "id", 'Operador principal', "username", "password_hash", "is_enabled" FROM "queue_panels"
ON CONFLICT DO NOTHING;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "queue_operator_sectors" (
  "operator_id" uuid NOT NULL REFERENCES "queue_operators"("id") ON DELETE cascade,
  "sector_id" uuid NOT NULL REFERENCES "queue_sectors"("id") ON DELETE cascade,
  PRIMARY KEY ("operator_id", "sector_id")
);
--> statement-breakpoint
ALTER TABLE "queue_sessions" ADD COLUMN IF NOT EXISTS "operator_id" uuid REFERENCES "queue_operators"("id") ON DELETE cascade;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "queue_tickets" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "panel_id" uuid NOT NULL REFERENCES "queue_panels"("id") ON DELETE cascade,
  "sector_id" uuid REFERENCES "queue_sectors"("id") ON DELETE set null,
  "sector_name" text,
  "kind" text NOT NULL DEFAULT 'normal',
  "number" integer NOT NULL,
  "label" text NOT NULL,
  "status" text NOT NULL DEFAULT 'waiting',
  "issued_at" timestamp with time zone NOT NULL DEFAULT now(),
  "called_at" timestamp with time zone
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "queue_tickets_panel_status_idx" ON "queue_tickets" ("panel_id", "status", "issued_at");

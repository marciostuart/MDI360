CREATE TABLE IF NOT EXISTS "queue_panels" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "organization_id" uuid NOT NULL REFERENCES "organizations"("id") ON DELETE cascade,
  "device_id" uuid NOT NULL REFERENCES "devices"("id") ON DELETE cascade,
  "is_enabled" boolean DEFAULT true NOT NULL,
  "mode" text DEFAULT 'sequential' NOT NULL,
  "prefix" text,
  "last_number" integer DEFAULT 0 NOT NULL,
  "display_seconds" integer DEFAULT 20 NOT NULL,
  "username" text NOT NULL,
  "password_hash" text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "queue_panels_device_unique" ON "queue_panels" ("device_id");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "queue_panels_username_unique" ON "queue_panels" ("username");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "queue_sectors" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "panel_id" uuid NOT NULL REFERENCES "queue_panels"("id") ON DELETE cascade,
  "name" text NOT NULL,
  "prefix" text,
  "last_number" integer DEFAULT 0 NOT NULL,
  "position" integer DEFAULT 0 NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "queue_sectors_panel_idx" ON "queue_sectors" ("panel_id","position");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "queue_calls" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "panel_id" uuid NOT NULL REFERENCES "queue_panels"("id") ON DELETE cascade,
  "sector_id" uuid REFERENCES "queue_sectors"("id") ON DELETE set null,
  "sector_name" text,
  "number" integer NOT NULL,
  "label" text NOT NULL,
  "spoken_text" text NOT NULL,
  "repeat_count" integer DEFAULT 0 NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "called_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "queue_calls_panel_idx" ON "queue_calls" ("panel_id","called_at");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "queue_sessions" (
  "id" text PRIMARY KEY NOT NULL,
  "panel_id" uuid NOT NULL REFERENCES "queue_panels"("id") ON DELETE cascade,
  "expires_at" timestamp with time zone NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "queue_sessions_panel_idx" ON "queue_sessions" ("panel_id");

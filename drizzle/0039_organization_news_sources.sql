CREATE TABLE IF NOT EXISTS "organization_news_sources" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "organization_id" uuid NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
  "label" text NOT NULL,
  "url" text NOT NULL,
  "credit" text NOT NULL,
  "enabled" boolean DEFAULT true NOT NULL,
  "refresh_minutes" integer DEFAULT 30 NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "organization_news_sources_org_url_unique"
  ON "organization_news_sources" ("organization_id", "url");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "organization_news_sources_org_idx"
  ON "organization_news_sources" ("organization_id");


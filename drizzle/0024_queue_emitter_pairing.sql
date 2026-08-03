CREATE TABLE IF NOT EXISTS "queue_emitters" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid,
	"panel_id" uuid,
	"name" text DEFAULT 'Terminal emissor' NOT NULL,
	"pairing_code" text,
	"pairing_expires_at" timestamp with time zone,
	"token_hash" text NOT NULL,
	"last_seen_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "queue_emitters" ADD CONSTRAINT "queue_emitters_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "queue_emitters" ADD CONSTRAINT "queue_emitters_panel_id_queue_panels_id_fk" FOREIGN KEY ("panel_id") REFERENCES "public"."queue_panels"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "queue_emitters_pairing_code_unique" ON "queue_emitters" USING btree ("pairing_code");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "queue_emitters_token_hash_unique" ON "queue_emitters" USING btree ("token_hash");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "queue_emitters_panel_idx" ON "queue_emitters" USING btree ("panel_id");

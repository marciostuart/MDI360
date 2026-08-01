ALTER TABLE "queue_sectors" ADD COLUMN IF NOT EXISTS "daily_limit" integer;
--> statement-breakpoint
ALTER TABLE "queue_operators" ADD COLUMN IF NOT EXISTS "desk_label" text;
--> statement-breakpoint
ALTER TABLE "queue_calls" ADD COLUMN IF NOT EXISTS "operator_id" uuid;
--> statement-breakpoint
ALTER TABLE "queue_calls" ADD COLUMN IF NOT EXISTS "desk_label" text;
--> statement-breakpoint
ALTER TABLE "queue_tickets" ADD COLUMN IF NOT EXISTS "called_by_operator_id" uuid;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "queue_calls" ADD CONSTRAINT "queue_calls_operator_id_fk"
    FOREIGN KEY ("operator_id") REFERENCES "queue_operators"("id") ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "queue_tickets" ADD CONSTRAINT "queue_tickets_called_by_operator_id_fk"
    FOREIGN KEY ("called_by_operator_id") REFERENCES "queue_operators"("id") ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

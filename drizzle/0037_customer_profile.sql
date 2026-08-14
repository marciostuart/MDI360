ALTER TABLE "billing_profiles" ADD COLUMN IF NOT EXISTS "phone" text DEFAULT '' NOT NULL;
--> statement-breakpoint
ALTER TABLE "billing_profiles" ADD COLUMN IF NOT EXISTS "complement" text DEFAULT '' NOT NULL;
--> statement-breakpoint
ALTER TABLE "billing_profiles" ADD COLUMN IF NOT EXISTS "completed_at" timestamp with time zone;

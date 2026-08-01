ALTER TABLE "plans" ADD COLUMN IF NOT EXISTS "price_per_device_cents" integer DEFAULT 0 NOT NULL;
--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN IF NOT EXISTS "price_per_device_override" integer;
--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN IF NOT EXISTS "billing_anchor_at" timestamp with time zone;
--> statement-breakpoint
UPDATE "organizations" SET "billing_anchor_at" = "created_at" WHERE "billing_anchor_at" IS NULL;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "billing_entries" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "organization_id" uuid NOT NULL REFERENCES "organizations"("id") ON DELETE cascade,
  "device_id" uuid,
  "device_name" text NOT NULL DEFAULT 'Tela',
  "kind" text NOT NULL,
  "period_start" timestamp with time zone NOT NULL,
  "period_end" timestamp with time zone NOT NULL,
  "charged_from" timestamp with time zone NOT NULL,
  "days" integer NOT NULL DEFAULT 0,
  "cycle_days" integer NOT NULL DEFAULT 30,
  "unit_price_cents" integer NOT NULL DEFAULT 0,
  "amount_cents" integer NOT NULL DEFAULT 0,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "billing_entries_org_period_idx" ON "billing_entries" ("organization_id","period_start");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "billing_entries_unique_kind_idx" ON "billing_entries" ("organization_id","device_id","period_start","kind");
--> statement-breakpoint
UPDATE "plans" SET "price_per_device_cents" = 1500 WHERE "slug" IN ('premium') AND "price_per_device_cents" = 0;
--> statement-breakpoint
UPDATE "plans" SET "price_per_device_cents" = 2000 WHERE "slug" IN ('corporativo') AND "price_per_device_cents" = 0;
--> statement-breakpoint
INSERT INTO "plans" ("name","slug","max_devices","max_storage_mb","price_cents","price_per_device_cents","queue_enabled","is_active")
VALUES ('Premium','premium',50,20480,0,1500,true,true)
ON CONFLICT ("slug") DO NOTHING;
--> statement-breakpoint
INSERT INTO "plans" ("name","slug","max_devices","max_storage_mb","price_cents","price_per_device_cents","queue_enabled","is_active")
VALUES ('Corporativo','corporativo',500,102400,0,2000,true,true)
ON CONFLICT ("slug") DO NOTHING;

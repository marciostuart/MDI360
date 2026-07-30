CREATE TABLE IF NOT EXISTS "plans" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "name" text NOT NULL,
  "slug" text NOT NULL UNIQUE,
  "max_devices" integer NOT NULL DEFAULT 5,
  "max_storage_mb" integer NOT NULL DEFAULT 1024,
  "price_cents" integer NOT NULL DEFAULT 0,
  "is_active" boolean NOT NULL DEFAULT true,
  "created_at" timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE "organizations" ADD COLUMN IF NOT EXISTS "plan_id" uuid REFERENCES "plans"("id") ON DELETE SET NULL;
ALTER TABLE "organizations" ADD COLUMN IF NOT EXISTS "subscription_status" text NOT NULL DEFAULT 'trial';
ALTER TABLE "organizations" ADD COLUMN IF NOT EXISTS "subscription_expires_at" timestamp with time zone;
ALTER TABLE "organizations" ADD COLUMN IF NOT EXISTS "device_limit_override" integer;
ALTER TABLE "organizations" ADD COLUMN IF NOT EXISTS "storage_limit_mb_override" integer;
ALTER TABLE "organizations" ADD COLUMN IF NOT EXISTS "admin_notes" text;

CREATE TABLE IF NOT EXISTS "traffic_hourly" (
  "bucket" timestamp with time zone PRIMARY KEY,
  "requests" integer NOT NULL DEFAULT 0,
  "bytes_in" bigint NOT NULL DEFAULT 0,
  "bytes_out" bigint NOT NULL DEFAULT 0
);

INSERT INTO "plans" ("name", "slug", "max_devices", "max_storage_mb", "price_cents") VALUES
  ('Essencial', 'essencial', 3, 2048, 9900),
  ('Profissional', 'profissional', 10, 10240, 24900),
  ('Rede', 'rede', 50, 51200, 79900)
ON CONFLICT ("slug") DO NOTHING;

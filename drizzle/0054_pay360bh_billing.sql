ALTER TABLE "billing_payment_attempts"
  ADD COLUMN IF NOT EXISTS "provider" text NOT NULL DEFAULT 'mercado_pago';

ALTER TABLE "billing_payment_attempts"
  DROP CONSTRAINT IF EXISTS "billing_payment_attempts_provider_check";
ALTER TABLE "billing_payment_attempts"
  ADD CONSTRAINT "billing_payment_attempts_provider_check"
  CHECK ("provider" IN ('mercado_pago', 'pay360bh'));

CREATE TABLE IF NOT EXISTS "pay360bh_billing_events" (
  "event_id" text PRIMARY KEY,
  "project_code" text NOT NULL,
  "reference" text NOT NULL,
  "payment_id" text NOT NULL,
  "status" text NOT NULL,
  "attempt_id" uuid,
  "received_at" timestamp with time zone NOT NULL DEFAULT now(),
  "processed_at" timestamp with time zone
);

CREATE INDEX IF NOT EXISTS "pay360bh_billing_events_reference_idx"
  ON "pay360bh_billing_events" ("reference");

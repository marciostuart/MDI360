ALTER TABLE "billing_payment_attempts"
  ADD COLUMN IF NOT EXISTS "provider_environment" text DEFAULT 'test' NOT NULL;

ALTER TABLE "billing_payment_attempts"
  DROP CONSTRAINT IF EXISTS "billing_payment_attempts_provider_environment_check";

ALTER TABLE "billing_payment_attempts"
  ADD CONSTRAINT "billing_payment_attempts_provider_environment_check"
  CHECK ("provider_environment" IN ('test', 'production'));

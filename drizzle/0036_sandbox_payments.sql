CREATE TABLE IF NOT EXISTS "billing_sandbox_tests" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "method" text NOT NULL,
  "amount_cents" integer NOT NULL,
  "status" text DEFAULT 'creating' NOT NULL,
  "status_detail" text,
  "provider_order_id" text,
  "provider_payment_id" text,
  "external_reference" text NOT NULL,
  "idempotency_key" text NOT NULL,
  "qr_code" text,
  "qr_code_base64" text,
  "ticket_url" text,
  "digitable_line" text,
  "redirect_url" text,
  "expires_at" timestamp with time zone,
  "webhook_received_at" timestamp with time zone,
  "provider_last_updated_at" timestamp with time zone,
  "created_by_user_id" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "billing_sandbox_tests_method_check" CHECK ("method" IN ('pix', 'card', 'boleto')),
  CONSTRAINT "billing_sandbox_tests_amount_check" CHECK ("amount_cents" BETWEEN 100 AND 100000)
);

CREATE UNIQUE INDEX IF NOT EXISTS "billing_sandbox_tests_order_unique"
  ON "billing_sandbox_tests" ("provider_order_id");
CREATE UNIQUE INDEX IF NOT EXISTS "billing_sandbox_tests_reference_unique"
  ON "billing_sandbox_tests" ("external_reference");
CREATE UNIQUE INDEX IF NOT EXISTS "billing_sandbox_tests_idempotency_unique"
  ON "billing_sandbox_tests" ("idempotency_key");
CREATE INDEX IF NOT EXISTS "billing_sandbox_tests_created_idx"
  ON "billing_sandbox_tests" ("created_at");

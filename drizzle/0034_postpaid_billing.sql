ALTER TABLE "organizations" ADD COLUMN IF NOT EXISTS "billing_enabled" boolean DEFAULT false NOT NULL;
ALTER TABLE "organizations" ADD COLUMN IF NOT EXISTS "billing_closing_day" smallint;
ALTER TABLE "organizations" ADD COLUMN IF NOT EXISTS "billing_pending_closing_day" smallint;
ALTER TABLE "organizations" ADD COLUMN IF NOT EXISTS "billing_activated_at" timestamp with time zone;
ALTER TABLE "organizations" ADD COLUMN IF NOT EXISTS "billing_suspended_at" timestamp with time zone;

ALTER TABLE "organizations" DROP CONSTRAINT IF EXISTS "organizations_billing_closing_day_check";
ALTER TABLE "organizations" ADD CONSTRAINT "organizations_billing_closing_day_check"
  CHECK ("billing_closing_day" IS NULL OR "billing_closing_day" IN (1, 5, 10, 15, 20));
ALTER TABLE "organizations" DROP CONSTRAINT IF EXISTS "organizations_billing_pending_closing_day_check";
ALTER TABLE "organizations" ADD CONSTRAINT "organizations_billing_pending_closing_day_check"
  CHECK ("billing_pending_closing_day" IS NULL OR "billing_pending_closing_day" IN (1, 5, 10, 15, 20));

CREATE TABLE IF NOT EXISTS "billing_invoices" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "organization_id" uuid NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
  "number" text NOT NULL,
  "period_start" timestamp with time zone NOT NULL,
  "period_end" timestamp with time zone NOT NULL,
  "due_at" timestamp with time zone NOT NULL,
  "status" text DEFAULT 'open' NOT NULL,
  "subtotal_cents" integer DEFAULT 0 NOT NULL,
  "credits_cents" integer DEFAULT 0 NOT NULL,
  "total_cents" integer DEFAULT 0 NOT NULL,
  "closed_at" timestamp with time zone DEFAULT now() NOT NULL,
  "paid_at" timestamp with time zone,
  "voided_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "billing_invoices_status_check" CHECK ("status" IN ('open', 'paid', 'overdue', 'void')),
  CONSTRAINT "billing_invoices_amount_check" CHECK ("subtotal_cents" >= 0 AND "credits_cents" <= 0 AND "total_cents" >= 0)
);
CREATE UNIQUE INDEX IF NOT EXISTS "billing_invoices_number_unique" ON "billing_invoices" ("number");
CREATE UNIQUE INDEX IF NOT EXISTS "billing_invoices_org_period_unique" ON "billing_invoices" ("organization_id", "period_end");
CREATE INDEX IF NOT EXISTS "billing_invoices_org_status_due_idx" ON "billing_invoices" ("organization_id", "status", "due_at");

CREATE TABLE IF NOT EXISTS "billing_invoice_items" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "invoice_id" uuid NOT NULL REFERENCES "billing_invoices"("id") ON DELETE CASCADE,
  "billing_entry_id" uuid REFERENCES "billing_entries"("id") ON DELETE SET NULL,
  "description" text NOT NULL,
  "quantity" integer DEFAULT 1 NOT NULL,
  "unit_amount_cents" integer DEFAULT 0 NOT NULL,
  "amount_cents" integer DEFAULT 0 NOT NULL,
  "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE INDEX IF NOT EXISTS "billing_invoice_items_invoice_idx" ON "billing_invoice_items" ("invoice_id");

CREATE TABLE IF NOT EXISTS "billing_payment_attempts" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "organization_id" uuid NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
  "method" text NOT NULL,
  "status" text DEFAULT 'creating' NOT NULL,
  "amount_cents" integer NOT NULL,
  "provider_order_id" text,
  "provider_payment_id" text,
  "external_reference" text NOT NULL,
  "idempotency_key" text NOT NULL,
  "active_key" text,
  "qr_code" text,
  "qr_code_base64" text,
  "ticket_url" text,
  "redirect_url" text,
  "digitable_line" text,
  "status_detail" text,
  "expires_at" timestamp with time zone,
  "approved_at" timestamp with time zone,
  "canceled_at" timestamp with time zone,
  "provider_last_updated_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "billing_payment_attempts_method_check" CHECK ("method" IN ('pix', 'card', 'boleto')),
  CONSTRAINT "billing_payment_attempts_amount_check" CHECK ("amount_cents" > 0)
);
CREATE UNIQUE INDEX IF NOT EXISTS "billing_payment_attempts_provider_order_unique" ON "billing_payment_attempts" ("provider_order_id");
CREATE UNIQUE INDEX IF NOT EXISTS "billing_payment_attempts_external_ref_unique" ON "billing_payment_attempts" ("external_reference");
CREATE UNIQUE INDEX IF NOT EXISTS "billing_payment_attempts_idempotency_unique" ON "billing_payment_attempts" ("idempotency_key");
CREATE UNIQUE INDEX IF NOT EXISTS "billing_payment_attempts_active_unique" ON "billing_payment_attempts" ("active_key");
CREATE INDEX IF NOT EXISTS "billing_payment_attempts_org_created_idx" ON "billing_payment_attempts" ("organization_id", "created_at");

CREATE TABLE IF NOT EXISTS "billing_payment_attempt_invoices" (
  "attempt_id" uuid NOT NULL REFERENCES "billing_payment_attempts"("id") ON DELETE CASCADE,
  "invoice_id" uuid NOT NULL REFERENCES "billing_invoices"("id") ON DELETE RESTRICT,
  "allocated_cents" integer NOT NULL,
  PRIMARY KEY ("attempt_id", "invoice_id")
);

CREATE TABLE IF NOT EXISTS "billing_profiles" (
  "organization_id" uuid PRIMARY KEY REFERENCES "organizations"("id") ON DELETE CASCADE,
  "legal_name" text NOT NULL,
  "document_type" text NOT NULL,
  "document_number" text NOT NULL,
  "zip_code" text NOT NULL,
  "street" text NOT NULL,
  "number" text NOT NULL,
  "neighborhood" text NOT NULL,
  "city" text NOT NULL,
  "state" text NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "billing_notifications" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "organization_id" uuid NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
  "invoice_id" uuid NOT NULL REFERENCES "billing_invoices"("id") ON DELETE CASCADE,
  "kind" text NOT NULL,
  "recipient" text,
  "status" text DEFAULT 'pending' NOT NULL,
  "attempts" integer DEFAULT 0 NOT NULL,
  "next_attempt_at" timestamp with time zone DEFAULT now() NOT NULL,
  "processing_at" timestamp with time zone,
  "error" text,
  "sent_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS "billing_notifications_invoice_kind_unique" ON "billing_notifications" ("invoice_id", "kind");
CREATE INDEX IF NOT EXISTS "billing_notifications_status_idx" ON "billing_notifications" ("status", "created_at");

CREATE TABLE IF NOT EXISTS "billing_credits" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "organization_id" uuid NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
  "attempt_id" uuid REFERENCES "billing_payment_attempts"("id") ON DELETE SET NULL,
  "amount_cents" integer NOT NULL,
  "remaining_cents" integer NOT NULL,
  "reason" text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE INDEX IF NOT EXISTS "billing_credits_org_remaining_idx" ON "billing_credits" ("organization_id", "remaining_cents");

CREATE TABLE IF NOT EXISTS "billing_audit_logs" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "organization_id" uuid NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
  "actor_user_id" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "action" text NOT NULL,
  "details" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE INDEX IF NOT EXISTS "billing_audit_logs_org_created_idx" ON "billing_audit_logs" ("organization_id", "created_at");

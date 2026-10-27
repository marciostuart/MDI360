CREATE TABLE IF NOT EXISTS quiz_leads (
  id uuid PRIMARY KEY,
  revision text NOT NULL,
  nome text NOT NULL, whatsapp text NOT NULL, email text NOT NULL, profile text NOT NULL,
  payload jsonb NOT NULL, responses jsonb NOT NULL, consent_text text NOT NULL, source_hash text,
  whatsapp_status text NOT NULL DEFAULT 'disabled', webhook_status text NOT NULL DEFAULT 'disabled',
  whatsapp_error text, webhook_error text,
  whatsapp_attempted_at timestamptz, webhook_attempted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS quiz_leads_created_idx ON quiz_leads(created_at);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS quiz_leads_source_idx ON quiz_leads(source_hash, created_at);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS quiz_leads_phone_idx ON quiz_leads(whatsapp, created_at);

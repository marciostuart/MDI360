CREATE TABLE IF NOT EXISTS "account_action_tokens" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "purpose" text NOT NULL,
  "token_hash" text NOT NULL,
  "pending_email" text,
  "expires_at" timestamp with time zone NOT NULL,
  "used_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "account_action_tokens_purpose_check"
    CHECK ("purpose" IN ('password_reset', 'email_change'))
);

CREATE UNIQUE INDEX IF NOT EXISTS "account_action_tokens_hash_unique"
  ON "account_action_tokens" ("token_hash");
CREATE INDEX IF NOT EXISTS "account_action_tokens_user_purpose_idx"
  ON "account_action_tokens" ("user_id", "purpose", "created_at");
CREATE INDEX IF NOT EXISTS "account_action_tokens_expiry_idx"
  ON "account_action_tokens" ("expires_at");

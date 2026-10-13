CREATE TABLE IF NOT EXISTS "device_token_revocations" (
	"token_hash" text PRIMARY KEY NOT NULL,
	"revoked_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE OR REPLACE FUNCTION capture_device_token_revocation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
	IF OLD.token_hash IS NOT NULL THEN
		INSERT INTO device_token_revocations (token_hash)
		VALUES (OLD.token_hash)
		ON CONFLICT (token_hash) DO NOTHING;
	END IF;
	RETURN OLD;
END;
$$;
--> statement-breakpoint
DROP TRIGGER IF EXISTS devices_capture_token_revocation ON devices;
--> statement-breakpoint
CREATE TRIGGER devices_capture_token_revocation
BEFORE DELETE ON devices
FOR EACH ROW EXECUTE FUNCTION capture_device_token_revocation();

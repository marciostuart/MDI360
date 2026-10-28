CREATE TABLE IF NOT EXISTS support_actions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id uuid NOT NULL,
  organization_id uuid,
  resource text NOT NULL,
  record_id text NOT NULL,
  action text NOT NULL,
  reason text NOT NULL,
  changed_fields jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS support_actions_created_idx ON support_actions (created_at);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS storage_cleanup_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid,
  storage_key text NOT NULL UNIQUE,
  attempts integer NOT NULL DEFAULT 0,
  last_error text,
  deleted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
-- Keep the file pointers even when a Studio deletion cascades through a queue.
-- No files or historical queues are deleted by this migration.
CREATE OR REPLACE FUNCTION enqueue_removed_record_files() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE k text; fields text[]; field text; owner_id uuid; row_data jsonb := to_jsonb(OLD);
BEGIN
  owner_id := CASE WHEN TG_TABLE_NAME = 'organizations' THEN OLD.id ELSE (row_data ->> 'organization_id')::uuid END;
  fields := CASE TG_TABLE_NAME
    WHEN 'queue_panels' THEN ARRAY['theme_bg_image_key','theme_image_key','kiosk_logo_key','kiosk_image_key','kiosk_bg_image_key','chime_storage_key']
    WHEN 'media_assets' THEN ARRAY['storage_key']
    WHEN 'devices' THEN ARRAY['last_screenshot_key']
    WHEN 'organizations' THEN ARRAY['brand_logo_key']
    ELSE ARRAY[]::text[] END;
  FOREACH field IN ARRAY fields LOOP
    k := row_data ->> field;
    IF k IS NOT NULL AND k <> '' AND owner_id IS NOT NULL
      AND (k LIKE 'org/' || owner_id::text || '/%' OR k LIKE 'branding/' || owner_id::text || '/%')
      AND (TG_OP = 'DELETE' OR (to_jsonb(NEW) ->> field) IS DISTINCT FROM k) THEN
      INSERT INTO storage_cleanup_jobs (organization_id, storage_key)
      VALUES (owner_id, k)
      ON CONFLICT (storage_key) DO UPDATE SET deleted_at = NULL;
    END IF;
  END LOOP;
  IF TG_TABLE_NAME = 'media_assets' THEN
    FOR k IN SELECT DISTINCT value #>> '{}' FROM jsonb_path_query(COALESCE(row_data -> 'widget_config', '{}'::jsonb), '$.**.backgroundImageKey') AS found(value) LOOP
      IF k IS NOT NULL AND k <> '' AND owner_id IS NOT NULL
        AND (k LIKE 'org/' || owner_id::text || '/%' OR k LIKE 'branding/' || owner_id::text || '/%')
        AND (TG_OP = 'DELETE' OR strpos(COALESCE((to_jsonb(NEW) -> 'widget_config')::text, ''), k) = 0) THEN
        INSERT INTO storage_cleanup_jobs (organization_id, storage_key)
        VALUES (owner_id, k)
        ON CONFLICT (storage_key) DO UPDATE SET deleted_at = NULL;
      END IF;
    END LOOP;
  END IF;
  RETURN OLD;
END; $$;
--> statement-breakpoint
DROP TRIGGER IF EXISTS queue_panels_cleanup_files ON queue_panels;
CREATE TRIGGER queue_panels_cleanup_files AFTER DELETE ON queue_panels FOR EACH ROW EXECUTE FUNCTION enqueue_removed_record_files();
--> statement-breakpoint
DROP TRIGGER IF EXISTS media_assets_cleanup_files ON media_assets;
CREATE TRIGGER media_assets_cleanup_files AFTER DELETE ON media_assets FOR EACH ROW EXECUTE FUNCTION enqueue_removed_record_files();
--> statement-breakpoint
DROP TRIGGER IF EXISTS devices_cleanup_files ON devices;
CREATE TRIGGER devices_cleanup_files AFTER DELETE ON devices FOR EACH ROW EXECUTE FUNCTION enqueue_removed_record_files();
--> statement-breakpoint
DROP TRIGGER IF EXISTS organizations_cleanup_files ON organizations;
CREATE TRIGGER organizations_cleanup_files AFTER DELETE ON organizations FOR EACH ROW EXECUTE FUNCTION enqueue_removed_record_files();
--> statement-breakpoint
DROP TRIGGER IF EXISTS queue_panels_replaced_files ON queue_panels;
CREATE TRIGGER queue_panels_replaced_files AFTER UPDATE OF theme_bg_image_key,theme_image_key,kiosk_logo_key,kiosk_image_key,kiosk_bg_image_key,chime_storage_key ON queue_panels FOR EACH ROW EXECUTE FUNCTION enqueue_removed_record_files();
--> statement-breakpoint
DROP TRIGGER IF EXISTS media_assets_replaced_files ON media_assets;
CREATE TRIGGER media_assets_replaced_files AFTER UPDATE OF storage_key,widget_config ON media_assets FOR EACH ROW EXECUTE FUNCTION enqueue_removed_record_files();
--> statement-breakpoint
DROP TRIGGER IF EXISTS organizations_replaced_logo ON organizations;
CREATE TRIGGER organizations_replaced_logo AFTER UPDATE OF brand_logo_key ON organizations FOR EACH ROW EXECUTE FUNCTION enqueue_removed_record_files();
--> statement-breakpoint
-- Historical labels stay intact; technical operator IDs must not dangle.
CREATE OR REPLACE FUNCTION cleanup_removed_queue_operator() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE replacement queue_operators%ROWTYPE;
BEGIN
  UPDATE queue_calls SET operator_id = NULL WHERE operator_id = OLD.id;
  UPDATE queue_tickets SET called_by_operator_id = NULL WHERE called_by_operator_id = OLD.id;
  SELECT * INTO replacement FROM queue_operators WHERE panel_id = OLD.panel_id AND id <> OLD.id ORDER BY created_at, id LIMIT 1;
  UPDATE queue_panels SET username = COALESCE(replacement.username, 'retired:' || OLD.panel_id::text),
    password_hash = COALESCE(replacement.password_hash, password_hash)
    WHERE id = OLD.panel_id AND username = OLD.username;
  RETURN OLD;
END; $$;
--> statement-breakpoint
DROP TRIGGER IF EXISTS queue_operators_cleanup_references ON queue_operators;
CREATE TRIGGER queue_operators_cleanup_references BEFORE DELETE ON queue_operators FOR EACH ROW EXECUTE FUNCTION cleanup_removed_queue_operator();

ALTER TABLE "queue_panels" ADD COLUMN IF NOT EXISTS "name" text;
--> statement-breakpoint
UPDATE "queue_panels" AS qp
SET "name" = COALESCE(NULLIF(BTRIM(d."name"), ''), 'Fila de atendimento')
FROM "devices" AS d
WHERE d."id" = qp."device_id" AND qp."name" IS NULL;
--> statement-breakpoint
UPDATE "queue_panels" SET "name" = 'Fila de atendimento' WHERE "name" IS NULL;
--> statement-breakpoint
ALTER TABLE "queue_panels" ALTER COLUMN "name" SET DEFAULT 'Fila de atendimento';
--> statement-breakpoint
ALTER TABLE "queue_panels" ALTER COLUMN "name" SET NOT NULL;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "queue_panel_devices" (
	"panel_id" uuid NOT NULL,
	"device_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "queue_panel_devices_panel_id_device_id_pk" PRIMARY KEY("panel_id","device_id"),
	CONSTRAINT "queue_panel_devices_panel_id_queue_panels_id_fk" FOREIGN KEY ("panel_id") REFERENCES "public"."queue_panels"("id") ON DELETE cascade,
	CONSTRAINT "queue_panel_devices_device_id_devices_id_fk" FOREIGN KEY ("device_id") REFERENCES "public"."devices"("id") ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "queue_panel_devices_device_unique" ON "queue_panel_devices" USING btree ("device_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "queue_panel_devices_panel_idx" ON "queue_panel_devices" USING btree ("panel_id");
--> statement-breakpoint
INSERT INTO "queue_panel_devices" ("panel_id", "device_id")
SELECT "id", "device_id" FROM "queue_panels"
ON CONFLICT DO NOTHING;
--> statement-breakpoint
DROP INDEX IF EXISTS "queue_panels_device_unique";
--> statement-breakpoint
ALTER TABLE "queue_panels" DROP COLUMN IF EXISTS "device_id";

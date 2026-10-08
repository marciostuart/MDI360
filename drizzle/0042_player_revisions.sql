ALTER TABLE "organizations" ADD COLUMN "player_revision" bigint NOT NULL DEFAULT 0;
ALTER TABLE "devices" ADD COLUMN "player_revision" bigint NOT NULL DEFAULT 0;

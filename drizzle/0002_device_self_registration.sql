ALTER TABLE "devices" ALTER COLUMN "organization_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "devices" ALTER COLUMN "name" SET DEFAULT 'Tela aguardando vínculo';
UPDATE "projects" SET "color" = '#6366f1' WHERE "color" IS NULL;
--> statement-breakpoint
ALTER TABLE "projects" ALTER COLUMN "color" SET DEFAULT '#6366f1';
--> statement-breakpoint
ALTER TABLE "projects" ALTER COLUMN "color" SET NOT NULL;

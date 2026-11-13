ALTER TABLE "users" ADD COLUMN "family_id" uuid;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "users_family_id_idx" ON "users" ("family_id");
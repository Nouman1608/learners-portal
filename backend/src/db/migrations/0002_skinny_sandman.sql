CREATE TABLE IF NOT EXISTS "fee_admin_notes" (
	"fee_id" uuid PRIMARY KEY NOT NULL,
	"note" text NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"updated_by" uuid
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "fee_admin_notes" ADD CONSTRAINT "fee_admin_notes_fee_id_fees_id_fk" FOREIGN KEY ("fee_id") REFERENCES "fees"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "fee_admin_notes" ADD CONSTRAINT "fee_admin_notes_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

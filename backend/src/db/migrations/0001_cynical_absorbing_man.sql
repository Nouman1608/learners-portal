-- "Invoice sent" tick box on the Fees page (who ticked it and when).
-- The expenses table in the generated snapshot already exists on the live database.
ALTER TABLE "fees" ADD COLUMN IF NOT EXISTS "invoice_sent_at" timestamp;--> statement-breakpoint
ALTER TABLE "fees" ADD COLUMN IF NOT EXISTS "invoice_sent_by" uuid;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "fees" ADD CONSTRAINT "fees_invoice_sent_by_users_id_fk" FOREIGN KEY ("invoice_sent_by") REFERENCES "users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

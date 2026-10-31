-- "Invoice sent" tick box on the Fees page: one row per fee marked as sent.
-- (The expenses table in the generated snapshot already exists on the live database.)
CREATE TABLE IF NOT EXISTS "fee_invoice_sent" (
	"fee_id" uuid PRIMARY KEY NOT NULL,
	"sent_at" timestamp DEFAULT now() NOT NULL,
	"sent_by" uuid
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "fee_invoice_sent" ADD CONSTRAINT "fee_invoice_sent_fee_id_fees_id_fk" FOREIGN KEY ("fee_id") REFERENCES "fees"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "fee_invoice_sent" ADD CONSTRAINT "fee_invoice_sent_sent_by_users_id_fk" FOREIGN KEY ("sent_by") REFERENCES "users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

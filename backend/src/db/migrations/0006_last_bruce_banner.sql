CREATE TABLE IF NOT EXISTS "expense_segments" (
	"expense_id" uuid PRIMARY KEY NOT NULL,
	"segment" varchar(10) NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "expense_segments" ADD CONSTRAINT "expense_segments_expense_id_expenses_id_fk" FOREIGN KEY ("expense_id") REFERENCES "expenses"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

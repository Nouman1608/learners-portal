CREATE TABLE IF NOT EXISTS "teacher_advances" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"teacher_id" uuid NOT NULL,
	"amount" numeric(12, 2) NOT NULL,
	"paid_on" date NOT NULL,
	"month" integer NOT NULL,
	"year" integer NOT NULL,
	"payment_method" varchar(20),
	"note" text,
	"created_by" uuid,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "teacher_advances_teacher_month_idx" ON "teacher_advances" ("teacher_id","year","month");--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "teacher_advances" ADD CONSTRAINT "teacher_advances_teacher_id_users_id_fk" FOREIGN KEY ("teacher_id") REFERENCES "users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "teacher_advances" ADD CONSTRAINT "teacher_advances_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

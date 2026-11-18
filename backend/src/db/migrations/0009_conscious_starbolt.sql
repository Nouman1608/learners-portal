CREATE TABLE IF NOT EXISTS "salary_slip_payments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"teacher_id" uuid NOT NULL,
	"slip_type" varchar(20) DEFAULT 'teacher' NOT NULL,
	"month" integer NOT NULL,
	"year" integer NOT NULL,
	"paid_on" date NOT NULL,
	"payment_method" varchar(20),
	"note" text,
	"created_by" uuid,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "salary_slip_payments_slip_unique" UNIQUE("teacher_id","slip_type","year","month")
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "salary_slip_payments" ADD CONSTRAINT "salary_slip_payments_teacher_id_users_id_fk" FOREIGN KEY ("teacher_id") REFERENCES "users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "salary_slip_payments" ADD CONSTRAINT "salary_slip_payments_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

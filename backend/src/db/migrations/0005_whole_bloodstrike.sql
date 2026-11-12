CREATE TABLE IF NOT EXISTS "teacher_monthly_attendance" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"teacher_id" uuid NOT NULL,
	"month" integer NOT NULL,
	"year" integer NOT NULL,
	"absences" integer DEFAULT 0 NOT NULL,
	"fri_mon_absences" integer DEFAULT 0 NOT NULL,
	"lates" integer DEFAULT 0 NOT NULL,
	"updated_by" uuid,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "teacher_monthly_attendance_teacher_month" UNIQUE("teacher_id","year","month")
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "teacher_monthly_attendance" ADD CONSTRAINT "teacher_monthly_attendance_teacher_id_users_id_fk" FOREIGN KEY ("teacher_id") REFERENCES "users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "teacher_monthly_attendance" ADD CONSTRAINT "teacher_monthly_attendance_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

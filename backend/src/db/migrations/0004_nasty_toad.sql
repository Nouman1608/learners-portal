CREATE TABLE IF NOT EXISTS "teacher_attendance_marks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"teacher_id" uuid NOT NULL,
	"date" date NOT NULL,
	"kind" varchar(10) NOT NULL,
	"note" text,
	"created_by" uuid,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "teacher_attendance_marks_teacher_date" UNIQUE("teacher_id","date")
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "teacher_attendance_marks_teacher_date_idx" ON "teacher_attendance_marks" ("teacher_id","date");--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "teacher_attendance_marks" ADD CONSTRAINT "teacher_attendance_marks_teacher_id_users_id_fk" FOREIGN KEY ("teacher_id") REFERENCES "users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "teacher_attendance_marks" ADD CONSTRAINT "teacher_attendance_marks_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

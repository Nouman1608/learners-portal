CREATE TABLE IF NOT EXISTS "attendance_records" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"course_event_id" uuid NOT NULL,
	"student_id" uuid NOT NULL,
	"status" varchar(20) NOT NULL,
	"joined_at" timestamp,
	"left_at" timestamp,
	"duration_minutes" integer,
	"source" varchar(20) DEFAULT 'teams' NOT NULL,
	"synced_at" timestamp DEFAULT now(),
	"teams_participant_id" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "attendance_records_course_event_id_student_id_unique" UNIQUE("course_event_id","student_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "attendance_sync_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"course_event_id" uuid NOT NULL,
	"synced_at" timestamp DEFAULT now() NOT NULL,
	"status" varchar(20) NOT NULL,
	"participant_count" integer,
	"error_message" text,
	"synced_by" varchar(20) DEFAULT 'cron'
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "teams_oauth" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"access_token" text NOT NULL,
	"refresh_token" text NOT NULL,
	"expires_at" timestamp NOT NULL,
	"scope" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "teams_oauth_user_id_unique" UNIQUE("user_id")
);
--> statement-breakpoint
ALTER TABLE "course_events" ADD COLUMN "teams_meeting_id" text;--> statement-breakpoint
ALTER TABLE "course_events" ADD COLUMN "teams_meeting_url" text;--> statement-breakpoint
ALTER TABLE "course_events" ADD COLUMN "teams_created_by" uuid;--> statement-breakpoint
ALTER TABLE "course_events" ADD COLUMN "attendance_synced" boolean DEFAULT false;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "attendance_event_idx" ON "attendance_records" ("course_event_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "attendance_student_idx" ON "attendance_records" ("student_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "attendance_synced_idx" ON "attendance_records" ("synced_at");--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "course_events" ADD CONSTRAINT "course_events_teams_created_by_users_id_fk" FOREIGN KEY ("teams_created_by") REFERENCES "users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "attendance_records" ADD CONSTRAINT "attendance_records_course_event_id_course_events_id_fk" FOREIGN KEY ("course_event_id") REFERENCES "course_events"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "attendance_records" ADD CONSTRAINT "attendance_records_student_id_users_id_fk" FOREIGN KEY ("student_id") REFERENCES "users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "attendance_sync_log" ADD CONSTRAINT "attendance_sync_log_course_event_id_course_events_id_fk" FOREIGN KEY ("course_event_id") REFERENCES "course_events"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "teams_oauth" ADD CONSTRAINT "teams_oauth_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

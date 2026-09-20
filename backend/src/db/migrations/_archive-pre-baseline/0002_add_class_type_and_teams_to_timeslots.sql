-- Add class type and Teams meeting fields to course_timeslots
ALTER TABLE "course_timeslots" ADD COLUMN "teacher_id" uuid;--> statement-breakpoint
ALTER TABLE "course_timeslots" ADD COLUMN "class_type" varchar(20) DEFAULT 'local' NOT NULL;--> statement-breakpoint
ALTER TABLE "course_timeslots" ADD COLUMN "teams_meeting_id" text;--> statement-breakpoint
ALTER TABLE "course_timeslots" ADD COLUMN "teams_meeting_url" text;--> statement-breakpoint
ALTER TABLE "course_timeslots" ADD COLUMN "teams_created_by" uuid;--> statement-breakpoint

-- Add class type to course_events
ALTER TABLE "course_events" ADD COLUMN "class_type" varchar(20) DEFAULT 'local' NOT NULL;--> statement-breakpoint

-- Remove old meeting fields (Jitsi/Daily support)
ALTER TABLE "course_events" DROP COLUMN IF EXISTS "meeting_url";--> statement-breakpoint
ALTER TABLE "course_events" DROP COLUMN IF EXISTS "meeting_platform";--> statement-breakpoint

-- Add foreign key constraints
DO $$ BEGIN
 ALTER TABLE "course_timeslots" ADD CONSTRAINT "course_timeslots_teacher_id_users_id_fk" FOREIGN KEY ("teacher_id") REFERENCES "users"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "course_timeslots" ADD CONSTRAINT "course_timeslots_teams_created_by_users_id_fk" FOREIGN KEY ("teams_created_by") REFERENCES "users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

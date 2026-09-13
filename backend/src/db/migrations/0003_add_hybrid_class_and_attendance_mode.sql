-- Migration: Add Hybrid Class Type and Attendance Mode Support
-- Description: Adds 'hybrid' class type, attendance_mode to enrollments, and manual attendance tracking

-- Add 'hybrid' to class type for timeslots
ALTER TABLE "course_timeslots"
  DROP CONSTRAINT IF EXISTS "course_timeslots_class_type_check";

ALTER TABLE "course_timeslots"
  ADD CONSTRAINT "course_timeslots_class_type_check"
  CHECK (class_type IN ('online', 'local', 'hybrid'));

-- Add 'hybrid' to class type for events
ALTER TABLE "course_events"
  DROP CONSTRAINT IF EXISTS "course_events_class_type_check";

ALTER TABLE "course_events"
  ADD CONSTRAINT "course_events_class_type_check"
  CHECK (class_type IN ('online', 'local', 'hybrid'));

-- Make roomId optional for all timeslots (remove NOT NULL if exists)
ALTER TABLE "course_timeslots"
  ALTER COLUMN "room_id" DROP NOT NULL;

-- Add attendance_mode to enrollments table
ALTER TABLE "enrollments"
  ADD COLUMN IF NOT EXISTS "attendance_mode" varchar(20) DEFAULT 'local' CHECK (attendance_mode IN ('local', 'online'));

-- Add comment explaining attendance_mode
COMMENT ON COLUMN "enrollments"."attendance_mode" IS
  'For hybrid classes: local = in-person only, online = remote via Teams';

-- Add 'manual' to source field options in attendance_records
ALTER TABLE "attendance_records"
  DROP CONSTRAINT IF EXISTS "attendance_records_source_check";

ALTER TABLE "attendance_records"
  ADD CONSTRAINT "attendance_records_source_check"
  CHECK (source IN ('teams', 'manual'));

-- Add index for attendance_mode queries
CREATE INDEX IF NOT EXISTS "enrollments_attendance_mode_idx" ON "enrollments"("attendance_mode");

-- Backfill existing enrollments with default 'local' mode
UPDATE "enrollments" SET "attendance_mode" = 'local' WHERE "attendance_mode" IS NULL;

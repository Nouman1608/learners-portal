-- Migration: Add '1-to-1' to class_type CHECK constraints
-- Date: 2024-12-29
-- Description: Updates CHECK constraints on course_timeslots and course_events to include '1-to-1' class type

-- Update CHECK constraint for course_timeslots
ALTER TABLE "course_timeslots"
  DROP CONSTRAINT IF EXISTS "course_timeslots_class_type_check";

ALTER TABLE "course_timeslots"
  ADD CONSTRAINT "course_timeslots_class_type_check"
  CHECK (class_type IN ('online', 'local', 'hybrid', '1-to-1'));

-- Update CHECK constraint for course_events
ALTER TABLE "course_events"
  DROP CONSTRAINT IF EXISTS "course_events_class_type_check";

ALTER TABLE "course_events"
  ADD CONSTRAINT "course_events_class_type_check"
  CHECK (class_type IN ('online', 'local', 'hybrid', '1-to-1'));

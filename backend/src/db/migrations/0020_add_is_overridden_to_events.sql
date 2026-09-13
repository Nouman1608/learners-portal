-- Add isOverridden column to course_events table
-- This flag indicates if an event was manually modified and should not be synced from timeslot updates

ALTER TABLE "course_events"
ADD COLUMN IF NOT EXISTS "is_overridden" boolean DEFAULT false;

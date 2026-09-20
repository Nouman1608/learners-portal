-- Migration: Change dayOfWeek from integer to integer array to support multiple days
-- Up Migration
ALTER TABLE "course_timeslots"
  RENAME COLUMN "day_of_week" TO "day_of_week_old";

ALTER TABLE "course_timeslots"
  ADD COLUMN "days_of_week" integer[] NOT NULL DEFAULT '{}';

-- Migrate existing data: convert single day to array
UPDATE "course_timeslots"
  SET "days_of_week" = ARRAY["day_of_week_old"];

-- Drop old column
ALTER TABLE "course_timeslots"
  DROP COLUMN "day_of_week_old";

-- Down Migration (commented out, for reference)
-- ALTER TABLE "course_timeslots"
--   ADD COLUMN "day_of_week" integer;
-- UPDATE "course_timeslots"
--   SET "day_of_week" = "days_of_week"[1];
-- ALTER TABLE "course_timeslots"
--   DROP COLUMN "days_of_week";

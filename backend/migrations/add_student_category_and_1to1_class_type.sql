-- Migration: Add student category and 1-to-1 class type
-- Date: 2024-12-29
-- Description: Adds studentCategory field to users table for Junior/Senior categorization
--              Updates class_type comments to include '1-to-1' option

-- Add student category column to users table
ALTER TABLE users
ADD COLUMN IF NOT EXISTS student_category VARCHAR(20);

COMMENT ON COLUMN users.student_category IS 'Student category: junior or senior (only applicable for students)';

-- Note: class_type column already exists in course_timeslots and course_events tables
-- The '1-to-1' value is now a valid option alongside 'online', 'local', and 'hybrid'
-- No database changes needed for class_type as it's already a varchar(20) field

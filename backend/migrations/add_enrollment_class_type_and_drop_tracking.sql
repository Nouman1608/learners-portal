-- Migration: Add class type and dropped student tracking to enrollments
-- Date: 2025-01-29
-- Description: Adds classType field for enrollment type (1-to-1, etc.) and tracking fields for dropped students

-- Add class type column
ALTER TABLE enrollments
ADD COLUMN IF NOT EXISTS class_type VARCHAR(20);

COMMENT ON COLUMN enrollments.class_type IS 'Type of enrollment: online, local, hybrid, or 1-to-1';

-- Add dropped student tracking columns
ALTER TABLE enrollments
ADD COLUMN IF NOT EXISTS dropped_at TIMESTAMP,
ADD COLUMN IF NOT EXISTS will_return_after_drop BOOLEAN,
ADD COLUMN IF NOT EXISTS tentative_return_date DATE;

COMMENT ON COLUMN enrollments.dropped_at IS 'Timestamp when student was marked as dropped';
COMMENT ON COLUMN enrollments.will_return_after_drop IS 'Whether the student plans to return after dropping';
COMMENT ON COLUMN enrollments.tentative_return_date IS 'Tentative date/month when student will return';

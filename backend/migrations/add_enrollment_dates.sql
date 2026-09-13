-- Migration: Add start date and end date to enrollments
-- Date: 2025-01-29
-- Description: Adds startDate and endDate fields to enrollments table to track enrollment duration

-- Add start date and end date columns to enrollments table
ALTER TABLE enrollments
ADD COLUMN IF NOT EXISTS start_date DATE,
ADD COLUMN IF NOT EXISTS end_date DATE;

COMMENT ON COLUMN enrollments.start_date IS 'Enrollment start date';
COMMENT ON COLUMN enrollments.end_date IS 'Enrollment end date (can be null for ongoing enrollments)';

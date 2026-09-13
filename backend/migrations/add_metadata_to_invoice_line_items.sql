-- Migration: Add metadata column to invoice_line_items table
-- Date: 2024-12-29
-- Description: Adds JSONB metadata column to store hierarchical invoice information
--              (attendance mode, course name, student name, student fee)

ALTER TABLE invoice_line_items
ADD COLUMN IF NOT EXISTS metadata JSONB;

COMMENT ON COLUMN invoice_line_items.metadata IS 'Stores additional structured data like attendanceMode, courseName, studentName, and studentFee';

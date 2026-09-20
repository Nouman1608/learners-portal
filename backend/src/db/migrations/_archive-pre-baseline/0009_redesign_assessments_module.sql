-- Migration: Redesign Assessments Module for PDF-based workflow
-- Drop type column, add start/end times, create new tables for files and annotations

-- Step 1: Modify assessments table
ALTER TABLE assessments DROP COLUMN IF EXISTS type;
ALTER TABLE assessments ADD COLUMN IF NOT EXISTS start_time TIMESTAMP;
ALTER TABLE assessments RENAME COLUMN due_date TO end_time;

-- For existing assessments, set default times if NULL
-- Start time = created_at, end time = 7 days from created_at if NULL
UPDATE assessments
SET start_time = created_at
WHERE start_time IS NULL;

UPDATE assessments
SET end_time = COALESCE(end_time, created_at + INTERVAL '7 days')
WHERE end_time IS NULL;

-- Make columns NOT NULL after backfilling
ALTER TABLE assessments ALTER COLUMN start_time SET NOT NULL;
ALTER TABLE assessments ALTER COLUMN end_time SET NOT NULL;

-- Step 2: Create assessment_files table (teacher question papers)
CREATE TABLE IF NOT EXISTS assessment_files (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  assessment_id UUID NOT NULL REFERENCES assessments(id) ON DELETE CASCADE,
  filename VARCHAR(255) NOT NULL,
  original_name VARCHAR(255) NOT NULL,
  file_url VARCHAR(500) NOT NULL,
  mime_type VARCHAR(100) NOT NULL,
  file_size INTEGER NOT NULL,
  uploaded_by UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  display_order INTEGER DEFAULT 0 NOT NULL,
  created_at TIMESTAMP DEFAULT NOW() NOT NULL
);

CREATE INDEX idx_assessment_files_assessment ON assessment_files(assessment_id);

-- Step 3: Create submission_files table (student submissions)
CREATE TABLE IF NOT EXISTS submission_files (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  result_id UUID NOT NULL REFERENCES assessment_results(id) ON DELETE CASCADE,
  filename VARCHAR(255) NOT NULL,
  original_name VARCHAR(255) NOT NULL,
  file_url VARCHAR(500) NOT NULL,
  mime_type VARCHAR(100) NOT NULL,
  file_size INTEGER NOT NULL,
  created_at TIMESTAMP DEFAULT NOW() NOT NULL,
  UNIQUE(result_id)
);

CREATE INDEX idx_submission_files_result ON submission_files(result_id);

-- Step 4: Create pdf_annotations table (teacher feedback annotations)
CREATE TABLE IF NOT EXISTS pdf_annotations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  result_id UUID NOT NULL REFERENCES assessment_results(id) ON DELETE CASCADE,
  teacher_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  page_number INTEGER NOT NULL,
  annotation_type VARCHAR(50) NOT NULL,
  annotation_data JSONB NOT NULL,
  created_at TIMESTAMP DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMP DEFAULT NOW() NOT NULL
);

CREATE INDEX idx_annotations_result ON pdf_annotations(result_id);
CREATE INDEX idx_annotations_page ON pdf_annotations(result_id, page_number);

ALTER TABLE "assessment_files"
ADD COLUMN IF NOT EXISTS "file_type" varchar(50) NOT NULL DEFAULT 'question_paper';

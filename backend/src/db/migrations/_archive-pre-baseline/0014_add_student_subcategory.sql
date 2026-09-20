-- Add student subcategory column to users table
ALTER TABLE users ADD COLUMN student_subcategory VARCHAR(30);

-- Add comment
COMMENT ON COLUMN users.student_subcategory IS 'Student subcategory: aitchison, preschool, summer_camp, academy (junior) or local, online (senior)';

-- Add separate fixed amounts for IG and A Level courses for online students
ALTER TABLE users DROP COLUMN IF EXISTS online_student_fixed_amount;
ALTER TABLE users ADD COLUMN online_student_fixed_amount_ig DECIMAL(10, 2);
ALTER TABLE users ADD COLUMN online_student_fixed_amount_alevel DECIMAL(10, 2);

COMMENT ON COLUMN users.online_student_fixed_amount_ig IS 'Fixed amount paid to teacher for online students in IG courses';
COMMENT ON COLUMN users.online_student_fixed_amount_alevel IS 'Fixed amount paid to teacher for online students in A Level courses';

-- Add course level field to courses table
ALTER TABLE courses ADD COLUMN course_level VARCHAR(20) DEFAULT 'ig';

COMMENT ON COLUMN courses.course_level IS 'Course level: ig or alevel';

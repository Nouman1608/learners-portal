ALTER TABLE "courses" ADD COLUMN IF NOT EXISTS "course_category" varchar(10);
ALTER TABLE "courses" ADD COLUMN IF NOT EXISTS "subject" varchar(100);
ALTER TABLE "courses" ADD COLUMN IF NOT EXISTS "teacher_name" varchar(100);
ALTER TABLE "courses" ADD COLUMN IF NOT EXISTS "student_name" varchar(100);
ALTER TABLE "courses" ALTER COLUMN "course_level" DROP DEFAULT;

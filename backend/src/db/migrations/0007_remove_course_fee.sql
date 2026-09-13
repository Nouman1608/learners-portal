-- Remove fee_per_month from courses table
-- Fees are now managed per student via enrollments

ALTER TABLE "courses"
DROP COLUMN IF EXISTS "fee_per_month";

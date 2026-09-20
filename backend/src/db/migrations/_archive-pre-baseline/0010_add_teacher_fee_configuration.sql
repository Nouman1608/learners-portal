-- Migration: Add teacher fee configuration fields
-- Created: 2025-12-27

-- Add local student fee percentage column (teacher's percentage of fee from local students)
ALTER TABLE "users"
  ADD COLUMN "local_student_fee_percentage" decimal(5, 2);

-- Add online student fixed amount column (fixed amount teacher receives per online student)
ALTER TABLE "users"
  ADD COLUMN "online_student_fixed_amount" decimal(10, 2);

-- Add indexes for faster lookups when generating teacher invoices
CREATE INDEX "users_local_fee_percentage_idx" ON "users" ("local_student_fee_percentage");
CREATE INDEX "users_online_fixed_amount_idx" ON "users" ("online_student_fixed_amount");

-- Add comment to clarify usage
COMMENT ON COLUMN "users"."local_student_fee_percentage" IS 'Percentage of fee that teacher receives from local students (0-100)';
COMMENT ON COLUMN "users"."online_student_fixed_amount" IS 'Fixed amount in currency that teacher receives per online student';

-- Rollback SQL (for reference):
-- DROP INDEX IF EXISTS "users_online_fixed_amount_idx";
-- DROP INDEX IF EXISTS "users_local_fee_percentage_idx";
-- ALTER TABLE "users" DROP COLUMN IF EXISTS "online_student_fixed_amount";
-- ALTER TABLE "users" DROP COLUMN IF EXISTS "local_student_fee_percentage";

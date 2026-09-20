-- Migration: Add per-student fee support
-- Description: Allow different students in the same course to have different fees
-- Date: 2025-12-25

-- Add custom fee per month to enrollments table
ALTER TABLE "enrollments"
  ADD COLUMN "custom_fee_per_month" decimal(10,2);

-- Add fee type for clarity
ALTER TABLE "enrollments"
  ADD COLUMN "fee_type" varchar(20) DEFAULT 'standard' CHECK (fee_type IN ('standard', 'custom', 'scholarship', 'discount'));

-- Add notes for fee override reasons
ALTER TABLE "enrollments"
  ADD COLUMN "fee_notes" text;

-- Add index on fee_type for filtering
CREATE INDEX "enrollments_fee_type_idx" ON "enrollments" ("fee_type");

-- Rollback SQL (run this to undo the migration)
-- ALTER TABLE "enrollments" DROP COLUMN IF EXISTS "custom_fee_per_month";
-- ALTER TABLE "enrollments" DROP COLUMN IF EXISTS "fee_type";
-- ALTER TABLE "enrollments" DROP COLUMN IF EXISTS "fee_notes";
-- DROP INDEX IF EXISTS "enrollments_fee_type_idx";

-- Migration: Simplify fee types to only 'custom' and 'scholarship'
-- Remove 'standard' and 'discount' options

-- Update the default value from 'standard' to 'custom'
ALTER TABLE "enrollments"
ALTER COLUMN "fee_type" SET DEFAULT 'custom';

-- Update any existing 'standard' fee types to 'custom'
UPDATE "enrollments"
SET "fee_type" = 'custom'
WHERE "fee_type" = 'standard';

-- Update any existing 'discount' fee types to 'custom'
UPDATE "enrollments"
SET "fee_type" = 'custom'
WHERE "fee_type" = 'discount';

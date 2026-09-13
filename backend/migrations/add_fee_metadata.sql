-- Migration: Add metadata tracking for fee generation
-- Description: Track how fees were calculated and their billing period
-- Date: 2025-12-29

-- Add metadata fields to fees table
ALTER TABLE "fees"
  ADD COLUMN IF NOT EXISTS "billing_type" varchar(20) DEFAULT 'monthly',
  ADD COLUMN IF NOT EXISTS "session_count" integer,
  ADD COLUMN IF NOT EXISTS "billing_period_start" date,
  ADD COLUMN IF NOT EXISTS "billing_period_end" date,
  ADD COLUMN IF NOT EXISTS "is_catch_up" boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS "fee_notes" text;

-- Add check constraint
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'fees_billing_type_check'
  ) THEN
    ALTER TABLE "fees" ADD CONSTRAINT "fees_billing_type_check"
      CHECK (billing_type IN ('monthly', 'usage', 'catch-up'));
  END IF;
END $$;

-- Add index for efficient querying
CREATE INDEX IF NOT EXISTS "fees_billing_type_idx" ON "fees" ("billing_type");

-- Update existing fees with default values
UPDATE "fees"
SET
  billing_type = 'monthly',
  is_catch_up = false,
  fee_notes = 'Legacy fee (pre-restructuring)'
WHERE billing_type IS NULL;

-- Rollback SQL (if needed):
-- DROP INDEX IF EXISTS "fees_billing_type_idx";
-- ALTER TABLE "fees" DROP CONSTRAINT IF EXISTS "fees_billing_type_check";
-- ALTER TABLE "fees" DROP COLUMN IF EXISTS "billing_type";
-- ALTER TABLE "fees" DROP COLUMN IF EXISTS "session_count";
-- ALTER TABLE "fees" DROP COLUMN IF EXISTS "billing_period_start";
-- ALTER TABLE "fees" DROP COLUMN IF EXISTS "billing_period_end";
-- ALTER TABLE "fees" DROP COLUMN IF EXISTS "is_catch_up";
-- ALTER TABLE "fees" DROP COLUMN IF EXISTS "fee_notes";

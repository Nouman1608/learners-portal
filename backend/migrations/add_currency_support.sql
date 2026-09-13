-- Migration: Add multi-currency support for online students
-- Description: Adds currency fields to enrollments and fees tables
--              Currencies: PKR (default), USD, GBP, SAR
-- Date: 2026-01-12

BEGIN;

-- Step 1: Add currency column to enrollments table
ALTER TABLE enrollments
  ADD COLUMN IF NOT EXISTS currency VARCHAR(3) NOT NULL DEFAULT 'PKR';

-- Add check constraint to ensure only valid currencies
ALTER TABLE enrollments
  ADD CONSTRAINT enrollments_currency_check
  CHECK (currency IN ('PKR', 'USD', 'GBP', 'SAR'));

-- Add comment
COMMENT ON COLUMN enrollments.currency IS 'Currency code for online students: PKR, USD, GBP, SAR';

-- Step 2: Add currency column to fees table
ALTER TABLE fees
  ADD COLUMN IF NOT EXISTS currency VARCHAR(3) NOT NULL DEFAULT 'PKR';

-- Add check constraint to ensure only valid currencies
ALTER TABLE fees
  ADD CONSTRAINT fees_currency_check
  CHECK (currency IN ('PKR', 'USD', 'GBP', 'SAR'));

-- Add comment
COMMENT ON COLUMN fees.currency IS 'Currency code for this fee';

-- Step 3: Create index for better query performance
CREATE INDEX IF NOT EXISTS idx_enrollments_currency ON enrollments(currency);
CREATE INDEX IF NOT EXISTS idx_fees_currency ON fees(currency);

-- Verify the columns were created
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_name = 'enrollments'
    AND column_name = 'currency'
  ) THEN
    RAISE EXCEPTION 'Currency column was not added to enrollments table';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_name = 'fees'
    AND column_name = 'currency'
  ) THEN
    RAISE EXCEPTION 'Currency column was not added to fees table';
  END IF;

  RAISE NOTICE 'Multi-currency support added successfully';
END $$;

COMMIT;

-- Rollback script (save this for reference):
-- BEGIN;
-- ALTER TABLE enrollments DROP CONSTRAINT IF EXISTS enrollments_currency_check;
-- ALTER TABLE enrollments DROP COLUMN IF EXISTS currency;
-- ALTER TABLE fees DROP CONSTRAINT IF EXISTS fees_currency_check;
-- ALTER TABLE fees DROP COLUMN IF EXISTS currency;
-- DROP INDEX IF EXISTS idx_enrollments_currency;
-- DROP INDEX IF EXISTS idx_fees_currency;
-- COMMIT;

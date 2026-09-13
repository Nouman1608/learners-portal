-- Combined Migration Script
-- Description: Runs both cascade fix and currency support migrations
-- Date: 2026-01-12

\echo '========================================='
\echo 'Running Combined Migration'
\echo '========================================='
\echo ''

-- ==============================================
-- MIGRATION 1: Cascade Constraint Fix
-- ==============================================
\echo 'Step 1: Updating cascade constraints...'

BEGIN;

-- Drop the existing foreign key constraint
ALTER TABLE payments
  DROP CONSTRAINT IF EXISTS payments_fee_id_fees_id_fk;

-- Add the new foreign key constraint with CASCADE
ALTER TABLE payments
  ADD CONSTRAINT payments_fee_id_fees_id_fk
  FOREIGN KEY (fee_id)
  REFERENCES fees(id)
  ON DELETE CASCADE;

-- Verify the constraint was created
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.table_constraints
    WHERE constraint_name = 'payments_fee_id_fees_id_fk'
    AND table_name = 'payments'
  ) THEN
    RAISE EXCEPTION 'Foreign key constraint was not created successfully';
  END IF;

  RAISE NOTICE '✓ Cascade constraint updated successfully';
END $$;

COMMIT;

\echo ''
\echo 'Step 1 Complete: Cascade constraints updated'
\echo ''

-- ==============================================
-- MIGRATION 2: Multi-Currency Support
-- ==============================================
\echo 'Step 2: Adding multi-currency support...'

BEGIN;

-- Add currency column to enrollments table
ALTER TABLE enrollments
  ADD COLUMN IF NOT EXISTS currency VARCHAR(3) NOT NULL DEFAULT 'PKR';

-- Add check constraint to ensure only valid currencies
ALTER TABLE enrollments
  ADD CONSTRAINT enrollments_currency_check
  CHECK (currency IN ('PKR', 'USD', 'GBP', 'SAR'));

-- Add comment
COMMENT ON COLUMN enrollments.currency IS 'Currency code for online students: PKR, USD, GBP, SAR';

-- Add currency column to fees table
ALTER TABLE fees
  ADD COLUMN IF NOT EXISTS currency VARCHAR(3) NOT NULL DEFAULT 'PKR';

-- Add check constraint to ensure only valid currencies
ALTER TABLE fees
  ADD CONSTRAINT fees_currency_check
  CHECK (currency IN ('PKR', 'USD', 'GBP', 'SAR'));

-- Add comment
COMMENT ON COLUMN fees.currency IS 'Currency code for this fee';

-- Create indexes for better query performance
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

  RAISE NOTICE '✓ Multi-currency support added successfully';
END $$;

COMMIT;

\echo ''
\echo 'Step 2 Complete: Multi-currency support added'
\echo ''

-- ==============================================
-- MIGRATION SUMMARY
-- ==============================================
\echo '========================================='
\echo 'Migration Summary'
\echo '========================================='
\echo '✓ Payments cascade constraint updated'
\echo '✓ Currency support added (PKR, USD, GBP, SAR)'
\echo '✓ Existing data defaults to PKR'
\echo ''
\echo 'Migration completed successfully!'
\echo '========================================='

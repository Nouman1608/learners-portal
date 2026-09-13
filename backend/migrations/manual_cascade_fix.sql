-- Migration: Update payments table foreign key to use CASCADE delete
-- Description: Changes fee_id foreign key from RESTRICT to CASCADE so that
--              when fees are deleted, associated payments are automatically deleted
-- Date: 2026-01-12

BEGIN;

-- Step 1: Drop the existing foreign key constraint
ALTER TABLE payments
  DROP CONSTRAINT IF EXISTS payments_fee_id_fees_id_fk;

-- Step 2: Add the new foreign key constraint with CASCADE
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
END $$;

COMMIT;

-- Rollback script (save this for reference):
-- BEGIN;
-- ALTER TABLE payments DROP CONSTRAINT IF EXISTS payments_fee_id_fees_id_fk;
-- ALTER TABLE payments ADD CONSTRAINT payments_fee_id_fees_id_fk
--   FOREIGN KEY (fee_id) REFERENCES fees(id) ON DELETE RESTRICT;
-- COMMIT;

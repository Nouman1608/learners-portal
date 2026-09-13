-- Migration: Add per-session fee for 1-to-1 classes
-- Description: Enable usage-based billing for 1-to-1 classes
-- Date: 2025-12-29

-- Add per-session fee field to enrollments
ALTER TABLE "enrollments"
  ADD COLUMN IF NOT EXISTS "per_session_fee" decimal(10,2);

-- Add comment explaining usage
COMMENT ON COLUMN "enrollments"."per_session_fee" IS 'Fee charged per completed session for 1-to-1 classes. Only used when classType = ''1-to-1''. NULL for regular classes.';

-- Rollback SQL (if needed):
-- ALTER TABLE "enrollments" DROP COLUMN IF EXISTS "per_session_fee";

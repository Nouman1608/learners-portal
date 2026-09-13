-- Migration: Add must_change_password flag to users
-- Description: Track whether a user must change their password on next login (first-time setup)
-- Date: 2026-04-18

ALTER TABLE "users"
  ADD COLUMN IF NOT EXISTS "must_change_password" boolean NOT NULL DEFAULT false;

-- Rollback SQL (if needed):
-- ALTER TABLE "users" DROP COLUMN IF EXISTS "must_change_password";

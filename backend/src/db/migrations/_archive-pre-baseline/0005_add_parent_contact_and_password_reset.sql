-- Migration: Add parent contact number and last password reset tracking
-- Created: 2025-12-25

-- Add parent phone column to users table
ALTER TABLE "users"
  ADD COLUMN "parent_phone" varchar(20);

-- Add last password reset timestamp
ALTER TABLE "users"
  ADD COLUMN "last_password_reset" timestamp;

-- Add index on parent_phone for faster lookups
CREATE INDEX "users_parent_phone_idx" ON "users" ("parent_phone");

-- Rollback SQL (for reference):
-- DROP INDEX IF EXISTS "users_parent_phone_idx";
-- ALTER TABLE "users" DROP COLUMN IF EXISTS "last_password_reset";
-- ALTER TABLE "users" DROP COLUMN IF EXISTS "parent_phone";

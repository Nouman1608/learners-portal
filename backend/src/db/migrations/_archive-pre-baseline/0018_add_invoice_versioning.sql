-- Add versioning support to invoices table
-- This allows regenerating invoices when data changes while keeping history

-- Add version column (default 1 for existing invoices)
ALTER TABLE "invoices" ADD COLUMN "version" integer DEFAULT 1 NOT NULL;

-- Add is_latest flag (default true for existing invoices)
ALTER TABLE "invoices" ADD COLUMN "is_latest" boolean DEFAULT true NOT NULL;

-- Drop the unique constraint to allow multiple versions
ALTER TABLE "invoices" DROP CONSTRAINT IF EXISTS "invoices_recipient_id_month_year_type_unique";

-- Create index on is_latest for faster queries
CREATE INDEX idx_invoices_latest ON "invoices" ("recipient_id", "month", "year", "type", "is_latest") WHERE "is_latest" = true;

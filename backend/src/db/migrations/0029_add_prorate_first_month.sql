ALTER TABLE "enrollments"
  ADD COLUMN IF NOT EXISTS "prorate_first_month" boolean DEFAULT false NOT NULL;

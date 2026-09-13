ALTER TABLE "enrollments"
  ADD COLUMN IF NOT EXISTS "expected_classes_per_month" integer;

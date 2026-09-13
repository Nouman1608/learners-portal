-- Catch-up migration: columns that exist in the Drizzle schema (and in the
-- production DB, where they were added manually) but were never captured in a
-- migration file. Idempotent — safe to run everywhere.

ALTER TABLE "users"
  ADD COLUMN IF NOT EXISTS "student_category" varchar(20),
  ADD COLUMN IF NOT EXISTS "must_change_password" boolean DEFAULT false NOT NULL;

ALTER TABLE "enrollments"
  ADD COLUMN IF NOT EXISTS "class_type" varchar(20),
  ADD COLUMN IF NOT EXISTS "currency" varchar(3) DEFAULT 'PKR' NOT NULL,
  ADD COLUMN IF NOT EXISTS "per_session_fee" numeric(10,2),
  ADD COLUMN IF NOT EXISTS "expected_classes_per_month" integer,
  ADD COLUMN IF NOT EXISTS "start_date" date,
  ADD COLUMN IF NOT EXISTS "end_date" date,
  ADD COLUMN IF NOT EXISTS "dropped_at" timestamp,
  ADD COLUMN IF NOT EXISTS "will_return_after_drop" boolean,
  ADD COLUMN IF NOT EXISTS "tentative_return_date" date;

ALTER TABLE "fees"
  ADD COLUMN IF NOT EXISTS "currency" varchar(3) DEFAULT 'PKR' NOT NULL,
  ADD COLUMN IF NOT EXISTS "billing_type" varchar(20) DEFAULT 'monthly' NOT NULL,
  ADD COLUMN IF NOT EXISTS "session_count" integer,
  ADD COLUMN IF NOT EXISTS "billing_period_start" date,
  ADD COLUMN IF NOT EXISTS "billing_period_end" date,
  ADD COLUMN IF NOT EXISTS "is_catch_up" boolean DEFAULT false NOT NULL,
  ADD COLUMN IF NOT EXISTS "fee_notes" text;

ALTER TABLE "invoice_line_items"
  ADD COLUMN IF NOT EXISTS "metadata" jsonb;

-- The '1-to-1' class type was never added to the CHECK constraints in a
-- migration (done manually in production). Recreate them with the full set.
ALTER TABLE "course_timeslots"
  DROP CONSTRAINT IF EXISTS "course_timeslots_class_type_check";
ALTER TABLE "course_timeslots"
  ADD CONSTRAINT "course_timeslots_class_type_check"
  CHECK (class_type IN ('online', 'local', 'hybrid', '1-to-1'));

ALTER TABLE "course_events"
  DROP CONSTRAINT IF EXISTS "course_events_class_type_check";
ALTER TABLE "course_events"
  ADD CONSTRAINT "course_events_class_type_check"
  CHECK (class_type IN ('online', 'local', 'hybrid', '1-to-1'));

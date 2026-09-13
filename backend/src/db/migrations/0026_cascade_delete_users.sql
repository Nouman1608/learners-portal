-- Migration: Allow permanent cascade delete of users
-- Changes all RESTRICT / NO ACTION FK constraints referencing users(id)
-- to CASCADE or SET NULL so that deleting a user doesn't fail.

-- ============================================================================
-- FKs that should CASCADE (user's own data — delete with user)
-- ============================================================================

-- invoices.recipient_id: restrict → cascade
ALTER TABLE invoices DROP CONSTRAINT IF EXISTS "invoices_recipient_id_users_id_fk";
ALTER TABLE invoices ADD CONSTRAINT "invoices_recipient_id_users_id_fk"
  FOREIGN KEY (recipient_id) REFERENCES users(id) ON DELETE CASCADE;

-- pdf_annotations.teacher_id: restrict → cascade (inline constraint from 0009)
ALTER TABLE pdf_annotations DROP CONSTRAINT IF EXISTS "pdf_annotations_teacher_id_fkey";
ALTER TABLE pdf_annotations DROP CONSTRAINT IF EXISTS "pdf_annotations_teacher_id_users_id_fk";
ALTER TABLE pdf_annotations ADD CONSTRAINT "pdf_annotations_teacher_id_users_id_fk"
  FOREIGN KEY (teacher_id) REFERENCES users(id) ON DELETE CASCADE;

-- ============================================================================
-- FKs that should SET NULL (audit/reference fields — keep record, null out ref)
-- ============================================================================

-- users.created_by: no action → set null
ALTER TABLE users DROP CONSTRAINT IF EXISTS "users_created_by_users_id_fk";
ALTER TABLE users ADD CONSTRAINT "users_created_by_users_id_fk"
  FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL;

-- courses.created_by: no action → set null
ALTER TABLE courses DROP CONSTRAINT IF EXISTS "courses_created_by_users_id_fk";
ALTER TABLE courses ADD CONSTRAINT "courses_created_by_users_id_fk"
  FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL;

-- course_timeslots.teacher_id: restrict → set null
ALTER TABLE course_timeslots DROP CONSTRAINT IF EXISTS "course_timeslots_teacher_id_users_id_fk";
ALTER TABLE course_timeslots ADD CONSTRAINT "course_timeslots_teacher_id_users_id_fk"
  FOREIGN KEY (teacher_id) REFERENCES users(id) ON DELETE SET NULL;

-- course_timeslots.teams_created_by: no action → set null
ALTER TABLE course_timeslots DROP CONSTRAINT IF EXISTS "course_timeslots_teams_created_by_users_id_fk";
ALTER TABLE course_timeslots ADD CONSTRAINT "course_timeslots_teams_created_by_users_id_fk"
  FOREIGN KEY (teams_created_by) REFERENCES users(id) ON DELETE SET NULL;

-- course_events.teacher_id: restrict → set null
ALTER TABLE course_events DROP CONSTRAINT IF EXISTS "course_events_teacher_id_users_id_fk";
ALTER TABLE course_events ADD CONSTRAINT "course_events_teacher_id_users_id_fk"
  FOREIGN KEY (teacher_id) REFERENCES users(id) ON DELETE SET NULL;

-- course_events.teams_created_by: no action → set null
ALTER TABLE course_events DROP CONSTRAINT IF EXISTS "course_events_teams_created_by_users_id_fk";
ALTER TABLE course_events ADD CONSTRAINT "course_events_teams_created_by_users_id_fk"
  FOREIGN KEY (teams_created_by) REFERENCES users(id) ON DELETE SET NULL;

-- enrollments.created_by: no action → set null
ALTER TABLE enrollments DROP CONSTRAINT IF EXISTS "enrollments_created_by_users_id_fk";
ALTER TABLE enrollments ADD CONSTRAINT "enrollments_created_by_users_id_fk"
  FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL;

-- fees.received_by: no action → set null
ALTER TABLE fees DROP CONSTRAINT IF EXISTS "fees_received_by_users_id_fk";
ALTER TABLE fees ADD CONSTRAINT "fees_received_by_users_id_fk"
  FOREIGN KEY (received_by) REFERENCES users(id) ON DELETE SET NULL;

-- payments.created_by: no action → set null
ALTER TABLE payments DROP CONSTRAINT IF EXISTS "payments_created_by_users_id_fk";
ALTER TABLE payments ADD CONSTRAINT "payments_created_by_users_id_fk"
  FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL;

-- assessment_results.graded_by: no action → set null
ALTER TABLE assessment_results DROP CONSTRAINT IF EXISTS "assessment_results_graded_by_users_id_fk";
ALTER TABLE assessment_results ADD CONSTRAINT "assessment_results_graded_by_users_id_fk"
  FOREIGN KEY (graded_by) REFERENCES users(id) ON DELETE SET NULL;

-- invoices.generated_by: no action → set null
ALTER TABLE invoices DROP CONSTRAINT IF EXISTS "invoices_generated_by_users_id_fk";
ALTER TABLE invoices ADD CONSTRAINT "invoices_generated_by_users_id_fk"
  FOREIGN KEY (generated_by) REFERENCES users(id) ON DELETE SET NULL;

-- ============================================================================
-- FKs that need NOT NULL dropped + SET NULL (inline constraints from 0009/0013)
-- ============================================================================

-- assessments.teacher_id: restrict → set null (drop NOT NULL)
ALTER TABLE assessments ALTER COLUMN teacher_id DROP NOT NULL;
ALTER TABLE assessments DROP CONSTRAINT IF EXISTS "assessments_teacher_id_users_id_fk";
ALTER TABLE assessments ADD CONSTRAINT "assessments_teacher_id_users_id_fk"
  FOREIGN KEY (teacher_id) REFERENCES users(id) ON DELETE SET NULL;

-- assessment_files.uploaded_by: restrict → set null (drop NOT NULL)
ALTER TABLE assessment_files ALTER COLUMN uploaded_by DROP NOT NULL;
ALTER TABLE assessment_files DROP CONSTRAINT IF EXISTS "assessment_files_uploaded_by_fkey";
ALTER TABLE assessment_files DROP CONSTRAINT IF EXISTS "assessment_files_uploaded_by_users_id_fk";
ALTER TABLE assessment_files ADD CONSTRAINT "assessment_files_uploaded_by_users_id_fk"
  FOREIGN KEY (uploaded_by) REFERENCES users(id) ON DELETE SET NULL;

-- leads.created_by: no action → set null (drop NOT NULL)
ALTER TABLE leads ALTER COLUMN created_by DROP NOT NULL;
ALTER TABLE leads DROP CONSTRAINT IF EXISTS "leads_created_by_fkey";
ALTER TABLE leads DROP CONSTRAINT IF EXISTS "leads_created_by_users_id_fk";
ALTER TABLE leads ADD CONSTRAINT "leads_created_by_users_id_fk"
  FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL;

-- message_templates.created_by: no action → set null (drop NOT NULL)
ALTER TABLE message_templates ALTER COLUMN created_by DROP NOT NULL;
ALTER TABLE message_templates DROP CONSTRAINT IF EXISTS "message_templates_created_by_fkey";
ALTER TABLE message_templates DROP CONSTRAINT IF EXISTS "message_templates_created_by_users_id_fk";
ALTER TABLE message_templates ADD CONSTRAINT "message_templates_created_by_users_id_fk"
  FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL;

-- lead_messages.sent_by: no action → set null (drop NOT NULL)
ALTER TABLE lead_messages ALTER COLUMN sent_by DROP NOT NULL;
ALTER TABLE lead_messages DROP CONSTRAINT IF EXISTS "lead_messages_sent_by_fkey";
ALTER TABLE lead_messages DROP CONSTRAINT IF EXISTS "lead_messages_sent_by_users_id_fk";
ALTER TABLE lead_messages ADD CONSTRAINT "lead_messages_sent_by_users_id_fk"
  FOREIGN KEY (sent_by) REFERENCES users(id) ON DELETE SET NULL;

-- whatsapp_credentials.created_by: no action → set null (drop NOT NULL)
ALTER TABLE whatsapp_credentials ALTER COLUMN created_by DROP NOT NULL;
ALTER TABLE whatsapp_credentials DROP CONSTRAINT IF EXISTS "whatsapp_credentials_created_by_fkey";
ALTER TABLE whatsapp_credentials DROP CONSTRAINT IF EXISTS "whatsapp_credentials_created_by_users_id_fk";
ALTER TABLE whatsapp_credentials ADD CONSTRAINT "whatsapp_credentials_created_by_users_id_fk"
  FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL;

-- ============================================================================
-- Non-user FKs that block cascade (invoice_line_items references fees/courses)
-- ============================================================================

-- invoice_line_items.fee_id: restrict → set null
ALTER TABLE invoice_line_items DROP CONSTRAINT IF EXISTS "invoice_line_items_fee_id_fees_id_fk";
ALTER TABLE invoice_line_items ADD CONSTRAINT "invoice_line_items_fee_id_fees_id_fk"
  FOREIGN KEY (fee_id) REFERENCES fees(id) ON DELETE SET NULL;

-- invoice_line_items.course_id: restrict → set null
ALTER TABLE invoice_line_items DROP CONSTRAINT IF EXISTS "invoice_line_items_course_id_courses_id_fk";
ALTER TABLE invoice_line_items ADD CONSTRAINT "invoice_line_items_course_id_courses_id_fk"
  FOREIGN KEY (course_id) REFERENCES courses(id) ON DELETE SET NULL;

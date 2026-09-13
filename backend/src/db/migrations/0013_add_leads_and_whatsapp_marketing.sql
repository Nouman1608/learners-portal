-- Migration: Add leads management and WhatsApp marketing system
-- Date: 2025-12-29
-- Description: Creates tables for tracking potential students (leads), WhatsApp message templates,
--              message history, and encrypted WhatsApp Business API credentials.
--              Enables automated re-engagement marketing via Meta's WhatsApp Business Cloud API.

-- ============================================================================
-- LEADS TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS leads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Contact Information
  name VARCHAR(200) NOT NULL,
  phone VARCHAR(20) NOT NULL,
  email VARCHAR(255),
  notes TEXT,

  -- Lead Journey Tracking
  status VARCHAR(20) NOT NULL DEFAULT 'new',
  source VARCHAR(50) NOT NULL DEFAULT 'manual',

  -- Marketing Schedule
  potential_join_date DATE,
  next_message_date DATE,

  -- Dropped Student Context (if created from dropped enrollment)
  original_enrollment_id UUID REFERENCES enrollments(id) ON DELETE SET NULL,
  tentative_return_date DATE,

  -- Opt-out Management
  opted_out BOOLEAN NOT NULL DEFAULT false,
  opted_out_at TIMESTAMP,

  -- Metadata
  created_by UUID NOT NULL REFERENCES users(id),
  converted_to_student_id UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS leads_phone_idx ON leads(phone);
CREATE INDEX IF NOT EXISTS leads_status_idx ON leads(status);
CREATE INDEX IF NOT EXISTS leads_next_message_idx ON leads(next_message_date);
CREATE INDEX IF NOT EXISTS leads_source_idx ON leads(source);

-- Column comments
COMMENT ON TABLE leads IS 'Potential students for marketing and re-engagement campaigns';
COMMENT ON COLUMN leads.name IS 'Full name of the potential student';
COMMENT ON COLUMN leads.phone IS 'Primary contact phone number (WhatsApp number in international format)';
COMMENT ON COLUMN leads.status IS 'Lead status: new, contacted, interested, enrolled, or lost';
COMMENT ON COLUMN leads.source IS 'How the lead was created: manual, dropped_enrollment, referral, website, etc.';
COMMENT ON COLUMN leads.potential_join_date IS 'Estimated date when the lead might enroll';
COMMENT ON COLUMN leads.next_message_date IS 'Next scheduled date to send a marketing message';
COMMENT ON COLUMN leads.original_enrollment_id IS 'Reference to enrollment if lead was created from a dropped student';
COMMENT ON COLUMN leads.tentative_return_date IS 'Date from willReturnAfterDrop when student dropped';
COMMENT ON COLUMN leads.opted_out IS 'Whether the lead has opted out of marketing messages';
COMMENT ON COLUMN leads.converted_to_student_id IS 'User ID if lead successfully enrolled as a student';

-- ============================================================================
-- MESSAGE TEMPLATES TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS message_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  name VARCHAR(100) NOT NULL UNIQUE,
  template_type VARCHAR(50) NOT NULL,

  -- WhatsApp Business API template details
  whatsapp_template_name VARCHAR(255),
  whatsapp_template_language VARCHAR(10) DEFAULT 'en',

  -- Template content (for reference and preview)
  subject VARCHAR(200),
  body TEXT NOT NULL,

  -- Approval status
  approval_status VARCHAR(20) NOT NULL DEFAULT 'pending',
  is_active BOOLEAN NOT NULL DEFAULT true,

  created_by UUID NOT NULL REFERENCES users(id),
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Column comments
COMMENT ON TABLE message_templates IS 'WhatsApp message templates for marketing campaigns';
COMMENT ON COLUMN message_templates.name IS 'Internal name for the template';
COMMENT ON COLUMN message_templates.template_type IS 'Type: re_engagement, course_info, follow_up, reminder';
COMMENT ON COLUMN message_templates.whatsapp_template_name IS 'Approved template name in Meta Business Manager';
COMMENT ON COLUMN message_templates.whatsapp_template_language IS 'Template language code (e.g., en, ur)';
COMMENT ON COLUMN message_templates.body IS 'Template content with placeholders {{1}}, {{2}}, etc.';
COMMENT ON COLUMN message_templates.approval_status IS 'Meta approval status: pending, approved, rejected';

-- ============================================================================
-- LEAD MESSAGES TABLE (Tracking)
-- ============================================================================

CREATE TABLE IF NOT EXISTS lead_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  lead_id UUID NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  template_id UUID REFERENCES message_templates(id) ON DELETE SET NULL,

  -- Message details
  message_type VARCHAR(50) NOT NULL,
  message_content TEXT NOT NULL,

  -- WhatsApp API details
  whatsapp_message_id VARCHAR(255),
  delivery_status VARCHAR(20) NOT NULL DEFAULT 'pending',

  -- Scheduling
  scheduled_for TIMESTAMP,
  sent_at TIMESTAMP,
  delivered_at TIMESTAMP,
  read_at TIMESTAMP,

  -- Error handling
  error_message TEXT,
  retry_count INTEGER NOT NULL DEFAULT 0,

  sent_by UUID NOT NULL REFERENCES users(id),
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS lead_messages_lead_idx ON lead_messages(lead_id);
CREATE INDEX IF NOT EXISTS lead_messages_scheduled_idx ON lead_messages(scheduled_for);
CREATE INDEX IF NOT EXISTS lead_messages_status_idx ON lead_messages(delivery_status);

-- Column comments
COMMENT ON TABLE lead_messages IS 'Tracking of all WhatsApp messages sent to leads';
COMMENT ON COLUMN lead_messages.message_type IS 'Type: re_engagement, course_info, follow_up, ad_hoc';
COMMENT ON COLUMN lead_messages.message_content IS 'Actual message content sent (with parameters filled in)';
COMMENT ON COLUMN lead_messages.whatsapp_message_id IS 'Message ID returned by WhatsApp Business API';
COMMENT ON COLUMN lead_messages.delivery_status IS 'Status: pending, sent, delivered, read, failed';
COMMENT ON COLUMN lead_messages.scheduled_for IS 'Timestamp for scheduled messages (NULL for immediate send)';

-- ============================================================================
-- WHATSAPP CREDENTIALS TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS whatsapp_credentials (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Only one active configuration
  is_active BOOLEAN NOT NULL DEFAULT true,

  -- Meta Cloud API credentials (encrypted)
  access_token TEXT NOT NULL,
  phone_number_id VARCHAR(255) NOT NULL,
  business_account_id VARCHAR(255) NOT NULL,

  -- Webhook verification
  webhook_verify_token VARCHAR(255),

  created_by UUID NOT NULL REFERENCES users(id),
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Column comments
COMMENT ON TABLE whatsapp_credentials IS 'Encrypted WhatsApp Business API credentials (Meta Cloud API)';
COMMENT ON COLUMN whatsapp_credentials.is_active IS 'Only one credential set should be active at a time';
COMMENT ON COLUMN whatsapp_credentials.access_token IS 'Encrypted permanent access token from Meta Business';
COMMENT ON COLUMN whatsapp_credentials.phone_number_id IS 'WhatsApp Business Phone Number ID from Meta';
COMMENT ON COLUMN whatsapp_credentials.business_account_id IS 'Meta Business Account ID';
COMMENT ON COLUMN whatsapp_credentials.webhook_verify_token IS 'Encrypted token for webhook verification';

-- ============================================================================
-- ROLLBACK SQL (for reference)
-- ============================================================================

-- DROP INDEX IF EXISTS lead_messages_status_idx;
-- DROP INDEX IF EXISTS lead_messages_scheduled_idx;
-- DROP INDEX IF EXISTS lead_messages_lead_idx;
-- DROP INDEX IF EXISTS leads_source_idx;
-- DROP INDEX IF EXISTS leads_next_message_idx;
-- DROP INDEX IF EXISTS leads_status_idx;
-- DROP INDEX IF EXISTS leads_phone_idx;
-- DROP TABLE IF EXISTS lead_messages;
-- DROP TABLE IF EXISTS message_templates;
-- DROP TABLE IF EXISTS whatsapp_credentials;
-- DROP TABLE IF EXISTS leads;

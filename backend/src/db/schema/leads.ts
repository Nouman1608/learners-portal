import { pgTable, uuid, varchar, text, date, timestamp, boolean, integer, index } from 'drizzle-orm/pg-core';
import { users } from './users';
import { enrollments } from './enrollments';

// ============================================================================
// LEADS TABLE
// ============================================================================

export const leads = pgTable('leads', {
  id: uuid('id').primaryKey().defaultRandom(),

  // Contact Information
  name: varchar('name', { length: 200 }).notNull(),
  phone: varchar('phone', { length: 20 }).notNull(), // Primary contact (WhatsApp number)
  email: varchar('email', { length: 255 }),
  notes: text('notes'), // General notes about the lead

  // Lead Journey Tracking
  status: varchar('status', { length: 20 }).default('new').notNull(),
  // Values: 'new', 'contacted', 'interested', 'enrolled', 'lost'

  source: varchar('source', { length: 50 }).default('manual').notNull(),
  // Values: 'manual', 'dropped_enrollment', 'referral', 'website', etc.

  // Marketing Schedule
  potentialJoinDate: date('potential_join_date'), // When they might join
  nextMessageDate: date('next_message_date'), // Next scheduled marketing message

  // Dropped Student Context (if created from dropped enrollment)
  originalEnrollmentId: uuid('original_enrollment_id').references(() => enrollments.id, { onDelete: 'set null' }),
  tentativeReturnDate: date('tentative_return_date'), // From willReturnAfterDrop

  // Opt-out Management
  optedOut: boolean('opted_out').default(false).notNull(),
  optedOutAt: timestamp('opted_out_at'),

  // Metadata
  createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
  convertedToStudentId: uuid('converted_to_student_id').references(() => users.id, { onDelete: 'set null' }), // If enrolled
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (table) => ({
  phoneIndex: index('leads_phone_idx').on(table.phone),
  statusIndex: index('leads_status_idx').on(table.status),
  nextMessageIndex: index('leads_next_message_idx').on(table.nextMessageDate),
  sourceIndex: index('leads_source_idx').on(table.source),
}));

// ============================================================================
// MESSAGE TEMPLATES TABLE
// ============================================================================

export const messageTemplates = pgTable('message_templates', {
  id: uuid('id').primaryKey().defaultRandom(),

  name: varchar('name', { length: 100 }).notNull().unique(), // Internal name
  templateType: varchar('template_type', { length: 50 }).notNull(),
  // Values: 're_engagement', 'course_info', 'follow_up', 'reminder'

  // WhatsApp Business API template details
  whatsappTemplateName: varchar('whatsapp_template_name', { length: 255 }), // Approved template name in Meta
  whatsappTemplateLanguage: varchar('whatsapp_template_language', { length: 10 }).default('en'),

  // Template content (for reference and preview)
  subject: varchar('subject', { length: 200 }),
  body: text('body').notNull(), // Template with placeholders {{1}}, {{2}}, etc.

  // Approval status
  approvalStatus: varchar('approval_status', { length: 20 }).default('pending').notNull(),
  // Values: 'pending', 'approved', 'rejected'

  isActive: boolean('is_active').default(true).notNull(),

  createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// ============================================================================
// LEAD MESSAGES TABLE (Tracking)
// ============================================================================

export const leadMessages = pgTable('lead_messages', {
  id: uuid('id').primaryKey().defaultRandom(),

  leadId: uuid('lead_id').references(() => leads.id, { onDelete: 'cascade' }).notNull(),
  templateId: uuid('template_id').references(() => messageTemplates.id, { onDelete: 'set null' }),

  // Message details
  messageType: varchar('message_type', { length: 50 }).notNull(),
  // Values: 're_engagement', 'course_info', 'follow_up', 'ad_hoc'

  messageContent: text('message_content').notNull(), // Actual message sent

  // WhatsApp API details
  whatsappMessageId: varchar('whatsapp_message_id', { length: 255 }), // From API response
  deliveryStatus: varchar('delivery_status', { length: 20 }).default('pending').notNull(),
  // Values: 'pending', 'sent', 'delivered', 'read', 'failed'

  // Scheduling
  scheduledFor: timestamp('scheduled_for'), // If scheduled
  sentAt: timestamp('sent_at'),
  deliveredAt: timestamp('delivered_at'),
  readAt: timestamp('read_at'),

  // Error handling
  errorMessage: text('error_message'),
  retryCount: integer('retry_count').default(0).notNull(),

  sentBy: uuid('sent_by').references(() => users.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (table) => ({
  leadIndex: index('lead_messages_lead_idx').on(table.leadId),
  scheduledIndex: index('lead_messages_scheduled_idx').on(table.scheduledFor),
  statusIndex: index('lead_messages_status_idx').on(table.deliveryStatus),
}));

// ============================================================================
// WHATSAPP CREDENTIALS TABLE
// ============================================================================

export const whatsappCredentials = pgTable('whatsapp_credentials', {
  id: uuid('id').primaryKey().defaultRandom(),

  // Only one active configuration
  isActive: boolean('is_active').default(true).notNull(),

  // Meta Cloud API credentials (encrypted)
  accessToken: text('access_token').notNull(), // Encrypted
  phoneNumberId: varchar('phone_number_id', { length: 255 }).notNull(), // WhatsApp Business Phone Number ID
  businessAccountId: varchar('business_account_id', { length: 255 }).notNull(),

  // Webhook verification
  webhookVerifyToken: varchar('webhook_verify_token', { length: 255 }), // Encrypted

  createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

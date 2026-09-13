import { pgTable, uuid, varchar, integer, decimal, timestamp, jsonb, boolean } from 'drizzle-orm/pg-core';
import { users } from './users';
import { courses } from './courses';
import { fees } from './enrollments';

export const invoices = pgTable('invoices', {
  id: uuid('id').primaryKey().defaultRandom(),
  invoiceNumber: varchar('invoice_number', { length: 50 }).notNull().unique(),
  type: varchar('type', { length: 20 }).notNull(), // 'student', 'teacher'
  recipientId: uuid('recipient_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
  month: integer('month').notNull(),
  year: integer('year').notNull(),
  version: integer('version').default(1).notNull(), // Version number for regenerated invoices
  isLatest: boolean('is_latest').default(true).notNull(), // Flag to identify the latest version
  currency: varchar('currency', { length: 3 }).default('PKR').notNull(), // Currency code: PKR, USD, GBP, SAR
  totalAmount: decimal('total_amount', { precision: 10, scale: 2 }).notNull(),
  pdfUrl: varchar('pdf_url', { length: 500 }), // Detailed PDF for admins
  simplifiedPdfUrl: varchar('simplified_pdf_url', { length: 500 }), // Simplified PDF for teachers (hides rates)
  emailedAt: timestamp('emailed_at'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  generatedBy: uuid('generated_by').references(() => users.id, { onDelete: 'set null' }),
});

export const invoiceLineItems = pgTable('invoice_line_items', {
  id: uuid('id').primaryKey().defaultRandom(),
  invoiceId: uuid('invoice_id').references(() => invoices.id, { onDelete: 'cascade' }).notNull(),
  description: varchar('description', { length: 255 }).notNull(),
  courseId: uuid('course_id').references(() => courses.id, { onDelete: 'set null' }),
  feeId: uuid('fee_id').references(() => fees.id, { onDelete: 'set null' }),
  quantity: decimal('quantity', { precision: 10, scale: 2 }).default('1').notNull(),
  unitPrice: decimal('unit_price', { precision: 10, scale: 2 }).notNull(),
  amount: decimal('amount', { precision: 10, scale: 2 }).notNull(),
  metadata: jsonb('metadata'), // Store additional data like attendanceMode, courseName, studentName
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

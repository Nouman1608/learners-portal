import { pgTable, uuid, integer, decimal, date, timestamp, varchar, text, unique, boolean } from 'drizzle-orm/pg-core';
import { users } from './users';
import { courses } from './courses';

export const enrollments = pgTable('enrollments', {
  id: uuid('id').primaryKey().defaultRandom(),
  studentId: uuid('student_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
  courseId: uuid('course_id').references(() => courses.id, { onDelete: 'restrict' }).notNull(),
  enrolledAt: timestamp('enrolled_at').defaultNow().notNull(),
  status: varchar('status', { length: 20 }).default('active').notNull(), // 'active', 'completed', 'dropped'
  attendanceMode: varchar('attendance_mode', { length: 20 }).default('local').notNull(), // 'local', 'online' - for hybrid classes
  classType: varchar('class_type', { length: 20 }), // 'online', 'local', 'hybrid', '1-to-1' - type of enrollment
  customFeePerMonth: decimal('custom_fee_per_month', { precision: 10, scale: 2 }), // Per-student fee (required for non-1-to-1)
  perSessionFee: decimal('per_session_fee', { precision: 10, scale: 2 }), // Fee per session for 1-to-1 classes only
  expectedClassesPerMonth: integer('expected_classes_per_month'), // Expected number of 1-to-1 sessions per month (for projected fee)
  currency: varchar('currency', { length: 3 }).default('PKR').notNull(), // Currency code: PKR, USD, GBP, SAR (only for online students)
  feeType: varchar('fee_type', { length: 20 }).default('custom'), // 'custom', 'scholarship'
  prorateFirstMonth: boolean('prorate_first_month').default(false).notNull(), // Pro-rate first month by days to sync billing to the 1st
  feeNotes: text('fee_notes'), // Reason for custom fee or scholarship
  startDate: date('start_date'), // Enrollment start date
  endDate: date('end_date'), // Enrollment end date (can be null for ongoing)
  completedAt: timestamp('completed_at'),
  droppedAt: timestamp('dropped_at'), // When student dropped
  willReturnAfterDrop: boolean('will_return_after_drop'), // Will student return after dropping
  tentativeReturnDate: date('tentative_return_date'), // Tentative month/date student will return
  createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (table) => ({
  uniqueEnrollment: unique().on(table.studentId, table.courseId),
}));

export const fees = pgTable('fees', {
  id: uuid('id').primaryKey().defaultRandom(),
  enrollmentId: uuid('enrollment_id').references(() => enrollments.id, { onDelete: 'cascade' }).notNull(),
  studentId: uuid('student_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
  courseId: uuid('course_id').references(() => courses.id, { onDelete: 'restrict' }).notNull(),
  month: integer('month').notNull(), // 1-12
  year: integer('year').notNull(),
  amount: decimal('amount', { precision: 10, scale: 2 }).notNull(),
  currency: varchar('currency', { length: 3 }).default('PKR').notNull(), // Currency code for this fee
  dueDate: date('due_date').notNull(),
  status: varchar('status', { length: 20 }).default('pending').notNull(), // 'pending', 'overdue', 'received'
  billingType: varchar('billing_type', { length: 20 }).default('monthly').notNull(), // 'monthly', 'usage', 'catch-up'
  sessionCount: integer('session_count'), // Number of sessions for usage-based fees (1-to-1 classes)
  billingPeriodStart: date('billing_period_start'), // Start of billing period (for usage-based)
  billingPeriodEnd: date('billing_period_end'), // End of billing period (for usage-based)
  isCatchUp: boolean('is_catch_up').default(false).notNull(), // True if this is a catch-up fee
  feeNotes: text('fee_notes'), // Additional notes about fee calculation
  receivedAt: timestamp('received_at'),
  receivedBy: uuid('received_by').references(() => users.id, { onDelete: 'set null' }),
  serialNumber: varchar('serial_number', { length: 255 }), // Serial number for cash payments
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (table) => ({
  uniqueFee: unique().on(table.enrollmentId, table.month, table.year),
}));

export const payments = pgTable('payments', {
  id: uuid('id').primaryKey().defaultRandom(),
  feeId: uuid('fee_id').references(() => fees.id, { onDelete: 'cascade' }).notNull(),
  studentId: uuid('student_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
  amount: decimal('amount', { precision: 10, scale: 2 }).notNull(),
  paymentMethod: varchar('payment_method', { length: 50 }).notNull(), // 'cash', 'bank_transfer', 'jazzcash', 'easypaisa', etc.
  transactionId: varchar('transaction_id', { length: 255 }),
  paymentDate: timestamp('payment_date').notNull(),
  proofUrl: varchar('proof_url', { length: 500 }), // URL to payment proof image/document
  notes: text('notes'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
});

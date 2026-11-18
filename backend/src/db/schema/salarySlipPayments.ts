import { pgTable, uuid, integer, date, varchar, text, timestamp, unique } from 'drizzle-orm/pg-core';
import { users } from './users';

// ============================================================================
// SALARY SLIP PAYMENTS - the day a teacher's salary slip for a month was paid.
// Kept apart from the invoices table because regenerating a slip writes a new
// invoice row: keyed by teacher + slip type + month, the payment survives that.
// ============================================================================

export const salarySlipPayments = pgTable('salary_slip_payments', {
  id: uuid('id').primaryKey().defaultRandom(),
  teacherId: uuid('teacher_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
  slipType: varchar('slip_type', { length: 20 }).default('teacher').notNull(), // 'teacher' | 'teacher_1to1'
  month: integer('month').notNull(), // slip month (1-12)
  year: integer('year').notNull(),
  paidOn: date('paid_on').notNull(), // day the money was handed over
  paymentMethod: varchar('payment_method', { length: 20 }), // cash, bank_transfer, other
  note: text('note'),
  createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (table) => ({
  oneSlip: unique('salary_slip_payments_slip_unique').on(table.teacherId, table.slipType, table.year, table.month),
}));

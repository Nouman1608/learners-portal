import { pgTable, uuid, integer, decimal, date, varchar, text, timestamp, index } from 'drizzle-orm/pg-core';
import { users } from './users';

// ============================================================================
// TEACHER SALARY ADVANCES - money paid to a teacher before their monthly invoice.
// An advance comes off the invoice for its month (month/year); any amount above
// that month's earnings carries over to the following months. The invoice total
// stays the full earnings, so teacher pay is never counted twice.
// ============================================================================

export const teacherAdvances = pgTable('teacher_advances', {
  id: uuid('id').primaryKey().defaultRandom(),
  teacherId: uuid('teacher_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
  amount: decimal('amount', { precision: 12, scale: 2 }).notNull(), // PKR
  paidOn: date('paid_on').notNull(), // day the money was handed over
  month: integer('month').notNull(), // invoice month it comes off (1-12)
  year: integer('year').notNull(),
  paymentMethod: varchar('payment_method', { length: 20 }), // cash, bank_transfer, other
  note: text('note'),
  createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (table) => ({
  teacherMonthIdx: index('teacher_advances_teacher_month_idx').on(table.teacherId, table.year, table.month),
}));

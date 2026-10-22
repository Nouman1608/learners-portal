import { pgTable, uuid, varchar, text, date, decimal, timestamp, index } from 'drizzle-orm/pg-core';
import { users } from './users';

// ============================================================================
// EXPENSES TABLE (sudo only) - rent, utilities, salaries, ... for income vs expenses
// ============================================================================

export const EXPENSE_CATEGORIES = [
  'rent', 'utilities', 'maintenance', 'supplies', 'salaries', 'subscriptions', 'marketing', 'transport', 'taxes', 'other',
] as const;
export type ExpenseCategory = (typeof EXPENSE_CATEGORIES)[number];

export const expenses = pgTable('expenses', {
  id: uuid('id').primaryKey().defaultRandom(),
  expenseDate: date('expense_date').notNull(),
  category: varchar('category', { length: 30 }).notNull(), // one of EXPENSE_CATEGORIES
  description: varchar('description', { length: 255 }),
  paidTo: varchar('paid_to', { length: 150 }),
  amount: decimal('amount', { precision: 12, scale: 2 }).notNull(),
  currency: varchar('currency', { length: 3 }).default('PKR').notNull(), // PKR, USD, GBP, SAR
  paymentMethod: varchar('payment_method', { length: 20 }), // cash, bank_transfer, card, cheque, other
  notes: text('notes'),
  createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (table) => ({
  expenseDateIdx: index('expenses_expense_date_idx').on(table.expenseDate),
}));

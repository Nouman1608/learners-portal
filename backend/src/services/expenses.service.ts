import { db, Database, juniorDb } from '../config/database';
import { expenses, ExpenseCategory } from '../db/schema/expenses';
import { users } from '../db/schema/users';
import { and, desc, eq, gte, lte, sql } from 'drizzle-orm';
import { AppError } from '../middleware/errorHandler';
import { pkrRateExpr } from './analytics.service';

export type Campus = 'senior' | 'junior' | 'both';

export interface ExpenseInput {
  expenseDate: string; // YYYY-MM-DD
  category: ExpenseCategory;
  description?: string;
  paidTo?: string;
  amount: string;
  currency?: string;
  paymentMethod?: string;
  notes?: string;
}

export interface MonthSummary {
  month: number; // 1-12
  incomePKR: number; // payments received for the month's fees
  teacherPayPKR: number; // teacher invoices for the month
  expensesPKR: number; // entered expenses
  byCategory: Record<string, number>; // PKR per expense category
  netPKR: number; // income - teacher pay - expenses
}

/** Databases for a campus view. Other campuses are only readable from the Senior portal (read-only connection). */
function databases(campus: Campus): Database[] {
  if (campus === 'senior') return [db];
  if (!juniorDb) throw new AppError(400, 'Junior Campus is not connected to this portal');
  return campus === 'junior' ? [juniorDb] : [db, juniorDb];
}

const blank = (v?: string) => (v && v.trim() ? v.trim() : null);

async function summaryFor(database: Database, year: number): Promise<MonthSummary[]> {
  const months: MonthSummary[] = Array.from({ length: 12 }, (_, i) => ({
    month: i + 1, incomePKR: 0, teacherPayPKR: 0, expensesPKR: 0, byCategory: {}, netPKR: 0,
  }));

  // By the month the fee is for (like teacher invoices), not the day it was paid
  const income = await database.execute(sql`
    select f.month as month,
           coalesce(sum(p.amount::numeric * ${pkrRateExpr(sql`f.currency`)}), 0)::float as pkr
    from payments p join fees f on f.id = p.fee_id
    where f.year = ${year}
    group by 1`);
  for (const r of income.rows as any[]) months[r.month - 1].incomePKR = r.pkr;

  const teacherPay = await database.execute(sql`
    select month, coalesce(sum(total_amount::numeric * ${pkrRateExpr(sql`currency`)}), 0)::float as pkr
    from invoices where type = 'teacher' and is_latest and year = ${year}
    group by 1`);
  for (const r of teacherPay.rows as any[]) months[r.month - 1].teacherPayPKR = r.pkr;

  const spent = await database.execute(sql`
    select extract(month from expense_date)::int as month, category,
           coalesce(sum(amount::numeric * ${pkrRateExpr(sql`currency`)}), 0)::float as pkr
    from expenses where extract(year from expense_date) = ${year}
    group by 1, 2`);
  for (const r of spent.rows as any[]) {
    const m = months[r.month - 1];
    m.byCategory[r.category] = (m.byCategory[r.category] || 0) + r.pkr;
    m.expensesPKR += r.pkr;
  }
  return months;
}

export const expensesService = {
  async list(campus: Campus, startDate: string, endDate: string, category?: string) {
    const lists = await Promise.all(databases(campus).map(async (database, i) => {
      const rows = await database
        .select({
          id: expenses.id,
          expenseDate: expenses.expenseDate,
          category: expenses.category,
          description: expenses.description,
          paidTo: expenses.paidTo,
          amount: expenses.amount,
          currency: expenses.currency,
          paymentMethod: expenses.paymentMethod,
          notes: expenses.notes,
          createdAt: expenses.createdAt,
          createdByName: sql<string | null>`trim(${users.firstName} || ' ' || ${users.lastName})`,
        })
        .from(expenses)
        .leftJoin(users, eq(users.id, expenses.createdBy))
        .where(and(
          gte(expenses.expenseDate, startDate),
          lte(expenses.expenseDate, endDate),
          category ? eq(expenses.category, category) : undefined,
        ))
        .orderBy(desc(expenses.expenseDate), desc(expenses.createdAt));
      const campusName = campus === 'both' ? (i === 0 ? 'senior' : 'junior') : campus;
      return rows.map((r) => ({ ...r, campus: campusName }));
    }));
    return lists.flat().sort((a, b) => (a.expenseDate < b.expenseDate ? 1 : a.expenseDate > b.expenseDate ? -1 : 0));
  },

  async summary(campus: Campus, year: number): Promise<MonthSummary[]> {
    const parts = await Promise.all(databases(campus).map((database) => summaryFor(database, year)));
    const months = parts[0];
    for (const other of parts.slice(1)) {
      other.forEach((m, i) => {
        const t = months[i];
        t.incomePKR += m.incomePKR;
        t.teacherPayPKR += m.teacherPayPKR;
        t.expensesPKR += m.expensesPKR;
        for (const [k, v] of Object.entries(m.byCategory)) t.byCategory[k] = (t.byCategory[k] || 0) + v;
      });
    }
    for (const m of months) m.netPKR = m.incomePKR - m.teacherPayPKR - m.expensesPKR;
    return months;
  },

  async create(input: ExpenseInput, userId: string) {
    const [row] = await db.insert(expenses).values({
      expenseDate: input.expenseDate,
      category: input.category,
      description: blank(input.description),
      paidTo: blank(input.paidTo),
      amount: input.amount,
      currency: input.currency || 'PKR',
      paymentMethod: blank(input.paymentMethod),
      notes: blank(input.notes),
      createdBy: userId,
    }).returning();
    return row;
  },

  async update(id: string, input: Partial<ExpenseInput>) {
    const [row] = await db.update(expenses).set({
      ...(input.expenseDate !== undefined && { expenseDate: input.expenseDate }),
      ...(input.category !== undefined && { category: input.category }),
      ...(input.description !== undefined && { description: blank(input.description) }),
      ...(input.paidTo !== undefined && { paidTo: blank(input.paidTo) }),
      ...(input.amount !== undefined && { amount: input.amount }),
      ...(input.currency !== undefined && { currency: input.currency }),
      ...(input.paymentMethod !== undefined && { paymentMethod: blank(input.paymentMethod) }),
      ...(input.notes !== undefined && { notes: blank(input.notes) }),
      updatedAt: new Date(),
    }).where(eq(expenses.id, id)).returning();
    if (!row) throw new AppError(404, 'Expense not found');
    return row;
  },

  async remove(id: string) {
    const [row] = await db.delete(expenses).where(eq(expenses.id, id)).returning({ id: expenses.id });
    if (!row) throw new AppError(404, 'Expense not found');
  },
};

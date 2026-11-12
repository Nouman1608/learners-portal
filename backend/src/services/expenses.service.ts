import { db, Database, juniorDb } from '../config/database';
import { expenses, expenseSegments, ExpenseCategory } from '../db/schema/expenses';
import { users } from '../db/schema/users';
import { and, desc, eq, gte, lte, sql, SQL } from 'drizzle-orm';
import { AppError } from '../middleware/errorHandler';
import { pkrRateExpr } from './analytics.service';
import { feeInBooks, booksStartDate } from '../utils/booksStart';

/**
 * Expenses views. On the Senior portal sudo sees four tabs:
 *   senior_local  - Senior portal, local side (fees of local class enrolments, local teacher pay, Local expenses)
 *   senior_online - Senior portal, online side
 *   junior        - the Junior Campus (read-only connection)
 *   both          - everything together
 * 'senior' = this portal's own database, both sides (admins, and the Junior portal itself).
 */
export type Campus = 'senior' | 'senior_local' | 'senior_online' | 'junior' | 'both';
export type Segment = 'local' | 'online';

/** Who is changing an expense: admins may only change the ones they entered */
export interface ExpenseActor {
  id: string;
  role: string;
}

async function assertCanChange(id: string, actor: ExpenseActor) {
  const [row] = await db.select({ createdBy: expenses.createdBy }).from(expenses).where(eq(expenses.id, id)).limit(1);
  if (!row) throw new AppError(404, 'Expense not found');
  if (actor.role !== 'sudo' && row.createdBy !== actor.id) {
    throw new AppError(403, 'You can only change expenses you entered');
  }
}

export interface ExpenseInput {
  expenseDate: string; // YYYY-MM-DD
  category: ExpenseCategory;
  description?: string;
  paidTo?: string;
  amount: string;
  currency?: string;
  paymentMethod?: string;
  notes?: string;
  segment?: Segment; // Senior portal: Local (default) or Online
}

export interface MonthSummary {
  month: number; // 1-12
  incomePKR: number; // payments received for the month's fees
  teacherPayPKR: number; // teacher invoices for the month
  expensesPKR: number; // entered expenses
  byCategory: Record<string, number>; // PKR per expense category
  netPKR: number; // income - teacher pay - expenses
}

interface View { database: Database; campus: 'senior' | 'junior'; segment?: Segment }

/** Databases (and senior side) for a view. The Junior Campus is only readable from the Senior portal. */
function views(campus: Campus): View[] {
  if (campus === 'senior') return [{ database: db, campus: 'senior' }];
  if (campus === 'senior_local') return [{ database: db, campus: 'senior', segment: 'local' }];
  if (campus === 'senior_online') return [{ database: db, campus: 'senior', segment: 'online' }];
  if (!juniorDb) throw new AppError(400, 'Junior Campus is not connected to this portal');
  const junior: View = { database: juniorDb, campus: 'junior' };
  return campus === 'junior' ? [junior] : [{ database: db, campus: 'senior' }, junior];
}

const blank = (v?: string) => (v && v.trim() ? v.trim() : null);
const segmentOf = sql<Segment>`coalesce((select s.segment from expense_segments s where s.expense_id = ${expenses.id}), 'local')`;

async function summaryFor({ database, segment }: View, year: number): Promise<MonthSummary[]> {
  const months: MonthSummary[] = Array.from({ length: 12 }, (_, i) => ({
    month: i + 1, incomePKR: 0, teacherPayPKR: 0, expensesPKR: 0, byCategory: {}, netPKR: 0,
  }));
  const side = (expr: SQL) => (segment ? sql`and ${expr} = ${segment}` : sql``);

  // By the month the fee is for (like teacher invoices), not the day it was paid;
  // local / online by the class enrolment the fee belongs to
  const income = await database.execute(sql`
    select f.month as month,
           coalesce(sum(p.amount::numeric * ${pkrRateExpr(sql`f.currency`)}), 0)::float as pkr
    from payments p join fees f on f.id = p.fee_id join enrollments e on e.id = f.enrollment_id
    where f.year = ${year} and ${feeInBooks(database, sql`f.year`, sql`f.month`)}
      ${side(sql`e.attendance_mode`)}
    group by 1`);
  for (const r of income.rows as any[]) months[r.month - 1].incomePKR = r.pkr;

  // Whole slips (after any deductions); a side = its slip lines for local / online students
  // (salary lines and older lines without a mode count as local)
  const teacherPay = segment
    ? await database.execute(sql`
        select i.month, coalesce(sum(li.amount::numeric * ${pkrRateExpr(sql`i.currency`)}), 0)::float as pkr
        from invoices i join invoice_line_items li on li.invoice_id = i.id
        where i.type = 'teacher' and i.is_latest and i.year = ${year}
          and ${feeInBooks(database, sql`i.year`, sql`i.month`)}
          and coalesce(li.metadata->>'attendanceMode', 'local') = ${segment}
        group by 1`)
    : await database.execute(sql`
        select month, coalesce(sum(total_amount::numeric * ${pkrRateExpr(sql`currency`)}), 0)::float as pkr
        from invoices where type = 'teacher' and is_latest and year = ${year}
          and ${feeInBooks(database, sql`year`, sql`month`)}
        group by 1`);
  for (const r of teacherPay.rows as any[]) months[r.month - 1].teacherPayPKR = r.pkr;

  const spent = await database.execute(sql`
    select extract(month from expense_date)::int as month, category,
           coalesce(sum(amount::numeric * ${pkrRateExpr(sql`currency`)}), 0)::float as pkr
    from expenses where extract(year from expense_date) = ${year}
      and ${feeInBooks(database, sql`extract(year from expense_date)`, sql`extract(month from expense_date)`)}
      ${side(sql`coalesce((select s.segment from expense_segments s where s.expense_id = expenses.id), 'local')`)}
    group by 1, 2`);
  for (const r of spent.rows as any[]) {
    const m = months[r.month - 1];
    m.byCategory[r.category] = (m.byCategory[r.category] || 0) + r.pkr;
    m.expensesPKR += r.pkr;
  }
  return months;
}

async function setSegment(expenseId: string, segment?: Segment) {
  if (segment === undefined) return;
  if (segment === 'online') {
    await db.insert(expenseSegments).values({ expenseId, segment })
      .onConflictDoUpdate({ target: expenseSegments.expenseId, set: { segment } });
  } else {
    await db.delete(expenseSegments).where(eq(expenseSegments.expenseId, expenseId));
  }
}

export const expensesService = {
  async list(campus: Campus, startDate: string, endDate: string, category?: string) {
    const lists = await Promise.all(views(campus).map(async (view) => {
      const { database } = view;
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
          createdBy: expenses.createdBy,
          createdByName: sql<string | null>`trim(${users.firstName} || ' ' || ${users.lastName})`,
          segment: segmentOf,
        })
        .from(expenses)
        .leftJoin(users, eq(users.id, expenses.createdBy))
        .where(and(
          gte(expenses.expenseDate, startDate),
          // Expenses before the books start (BOOKS_START) are not shown
          gte(expenses.expenseDate, booksStartDate(database) ?? startDate),
          lte(expenses.expenseDate, endDate),
          category ? eq(expenses.category, category) : undefined,
          view.segment ? sql`${segmentOf} = ${view.segment}` : undefined,
        ))
        .orderBy(desc(expenses.expenseDate), desc(expenses.createdAt));
      return rows.map((r) => ({ ...r, campus: view.campus, segment: view.campus === 'senior' ? r.segment : null }));
    }));
    return lists.flat().sort((a, b) => (a.expenseDate < b.expenseDate ? 1 : a.expenseDate > b.expenseDate ? -1 : 0));
  },

  async summary(campus: Campus, year: number): Promise<MonthSummary[]> {
    const parts = await Promise.all(views(campus).map((view) => summaryFor(view, year)));
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
    await setSegment(row.id, input.segment);
    return row;
  },

  async update(id: string, input: Partial<ExpenseInput>, actor: ExpenseActor) {
    await assertCanChange(id, actor);
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
    await setSegment(id, input.segment);
    return row;
  },

  async remove(id: string, actor: ExpenseActor) {
    await assertCanChange(id, actor);
    const [row] = await db.delete(expenses).where(eq(expenses.id, id)).returning({ id: expenses.id });
    if (!row) throw new AppError(404, 'Expense not found');
  },
};

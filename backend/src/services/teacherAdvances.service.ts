import { db, Database } from '../config/database';
import { teacherAdvances } from '../db/schema/teacherAdvances';
import { invoices } from '../db/schema/invoices';
import { users } from '../db/schema/users';
import { and, desc, eq, sql } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import { AppError } from '../middleware/errorHandler';

export interface AdvanceInput {
  teacherId: string;
  amount: string;
  paidOn: string; // YYYY-MM-DD
  month: number; // invoice month it comes off
  year: number;
  paymentMethod?: string;
  note?: string;
}

/** What a teacher's invoice for one month shows about salary advances */
export interface AdvanceSummary {
  broughtForward: number; // advances from earlier months not yet recovered
  advances: { paidOn: string; amount: number; paymentMethod: string | null; note: string | null }[]; // this month's
  deducted: number; // taken off this month's earnings
  balance: number; // earnings - deducted = still to pay the teacher
  carryForward: number; // advance still to recover from later months
}

const monthIndex = (year: number, month: number) => year * 12 + month;
const round2 = (n: number) => Math.round(n * 100) / 100;

export const teacherAdvancesService = {
  async list(filters: { teacherId?: string; month?: number; year?: number }) {
    const creator = alias(users, 'creator');
    return db
      .select({
        id: teacherAdvances.id,
        teacherId: teacherAdvances.teacherId,
        teacherName: sql<string>`trim(${users.firstName} || ' ' || ${users.lastName})`,
        amount: teacherAdvances.amount,
        paidOn: teacherAdvances.paidOn,
        month: teacherAdvances.month,
        year: teacherAdvances.year,
        paymentMethod: teacherAdvances.paymentMethod,
        note: teacherAdvances.note,
        createdAt: teacherAdvances.createdAt,
        createdByName: sql<string | null>`trim(${creator.firstName} || ' ' || ${creator.lastName})`,
      })
      .from(teacherAdvances)
      .innerJoin(users, eq(users.id, teacherAdvances.teacherId))
      .leftJoin(creator, eq(creator.id, teacherAdvances.createdBy))
      .where(and(
        filters.teacherId ? eq(teacherAdvances.teacherId, filters.teacherId) : undefined,
        filters.month ? eq(teacherAdvances.month, filters.month) : undefined,
        filters.year ? eq(teacherAdvances.year, filters.year) : undefined,
      ))
      .orderBy(desc(teacherAdvances.paidOn), desc(teacherAdvances.createdAt));
  },

  async create(input: AdvanceInput, userId: string) {
    const [teacher] = await db.select({ role: users.role }).from(users).where(eq(users.id, input.teacherId)).limit(1);
    if (!teacher || teacher.role !== 'teacher') throw new AppError(404, 'Teacher not found');
    const [row] = await db.insert(teacherAdvances).values({
      teacherId: input.teacherId,
      amount: input.amount,
      paidOn: input.paidOn,
      month: input.month,
      year: input.year,
      paymentMethod: input.paymentMethod?.trim() || null,
      note: input.note?.trim() || null,
      createdBy: userId,
    }).returning();
    return row;
  },

  async remove(id: string) {
    const [row] = await db.delete(teacherAdvances).where(eq(teacherAdvances.id, id)).returning();
    if (!row) throw new AppError(404, 'Advance not found');
    return row;
  },

  /**
   * Advances on a teacher's invoice for month/year. Walks month by month from the first
   * advance: each month's earnings (its latest teacher invoice) absorb what is owed, and
   * the rest carries forward. `earnings` is this month's invoice total. Null if none apply.
   */
  async summaryFor(teacherId: string, month: number, year: number, earnings: number, database: Database = db): Promise<AdvanceSummary | null> {
    const target = monthIndex(year, month);
    const rows = await database
      .select({
        amount: teacherAdvances.amount, paidOn: teacherAdvances.paidOn, month: teacherAdvances.month,
        year: teacherAdvances.year, paymentMethod: teacherAdvances.paymentMethod, note: teacherAdvances.note,
      })
      .from(teacherAdvances)
      .where(and(eq(teacherAdvances.teacherId, teacherId),
        sql`${teacherAdvances.year} * 12 + ${teacherAdvances.month} <= ${target}`))
      .orderBy(teacherAdvances.paidOn);
    if (!rows.length) return null;

    const byMonth = new Map<number, number>();
    for (const r of rows) {
      const i = monthIndex(r.year, r.month);
      byMonth.set(i, (byMonth.get(i) || 0) + Number(r.amount));
    }
    const first = Math.min(...byMonth.keys());

    let carry = 0;
    if (first < target) {
      const earned = await database
        .select({ month: invoices.month, year: invoices.year, total: invoices.totalAmount })
        .from(invoices)
        .where(and(eq(invoices.type, 'teacher'), eq(invoices.recipientId, teacherId), eq(invoices.isLatest, true),
          sql`${invoices.year} * 12 + ${invoices.month} >= ${first}`,
          sql`${invoices.year} * 12 + ${invoices.month} < ${target}`));
      const earnedBy = new Map(earned.map((e) => [monthIndex(e.year, e.month), Number(e.total)]));
      for (let i = first; i < target; i++) {
        const owed = carry + (byMonth.get(i) || 0);
        carry = owed - Math.min(owed, earnedBy.get(i) || 0);
      }
    }

    const advances = rows
      .filter((r) => monthIndex(r.year, r.month) === target)
      .map((r) => ({ paidOn: r.paidOn, amount: Number(r.amount), paymentMethod: r.paymentMethod, note: r.note }));
    if (!advances.length && carry <= 0) return null;

    const owed = carry + advances.reduce((s, a) => s + a.amount, 0);
    const deducted = Math.min(owed, Math.max(earnings, 0));
    return {
      broughtForward: round2(carry),
      advances,
      deducted: round2(deducted),
      balance: round2(earnings - deducted),
      carryForward: round2(owed - deducted),
    };
  },
};

export default teacherAdvancesService;

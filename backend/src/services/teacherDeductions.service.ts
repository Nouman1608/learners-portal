import { db } from '../config/database';
import { teacherMonthlyAttendance } from '../db/schema/teacherAttendanceMarks';
import { users } from '../db/schema/users';
import { and, asc, eq, sql } from 'drizzle-orm';
import { AppError } from '../middleware/errorHandler';

/**
 * Junior campus rules (owner, 2026-11-12), from each teacher's monthly totals:
 *  - Day's pay = the month's earnings / Monday-Friday days in the month.
 *  - Absences on Tuesday-Thursday: 2 a month are allowed, then 1 day each.
 *  - Absences on a Friday or Monday: always 2 days each (never free).
 *  - Lates: 2 a month are allowed, then half a day each.
 */
export const FREE_LATES = 2;
export const FREE_ABSENCES = 2;

export interface MonthCounts {
  absences: number; // Tuesday-Thursday
  friMonAbsences: number;
  lates: number;
}

export interface DeductionItem {
  label: string; // e.g. "Absences (Tue–Thu): 3, 2 allowed"
  days: number; // days of pay deducted
  amount: number;
}

export interface DeductionSummary extends MonthCounts {
  workingDays: number;
  dayPay: number;
  gross: number; // earnings before deductions
  days: number; // total days of pay deducted
  total: number; // amount deducted (never more than gross)
  items: DeductionItem[];
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/** Monday-Friday days in a month */
export function workingDaysIn(month: number, year: number): number {
  const last = new Date(Date.UTC(year, month, 0)).getUTCDate();
  let count = 0;
  for (let day = 1; day <= last; day++) {
    const wd = new Date(Date.UTC(year, month - 1, day)).getUTCDay();
    if (wd >= 1 && wd <= 5) count++;
  }
  return count;
}

/** Days of pay deducted for each kind (pure: no database) */
export function deductionDays(c: MonthCounts) {
  const absenceDays = Math.max(0, c.absences - FREE_ABSENCES);
  const friMonDays = 2 * c.friMonAbsences;
  const lateDays = 0.5 * Math.max(0, c.lates - FREE_LATES);
  return { absenceDays, friMonDays, lateDays, days: absenceDays + friMonDays + lateDays };
}

/** Deduction for one month's earnings (pure: no database). Null when nothing was entered. */
export function calculateDeduction(c: MonthCounts | null, gross: number, month: number, year: number): DeductionSummary | null {
  if (!c || (!c.absences && !c.friMonAbsences && !c.lates)) return null;
  const workingDays = workingDaysIn(month, year);
  const dayPay = gross > 0 ? gross / workingDays : 0;
  const d = deductionDays(c);
  const items: DeductionItem[] = [];
  if (c.absences) items.push({ label: `Absences (Tue–Thu): ${c.absences}, ${FREE_ABSENCES} allowed`, days: d.absenceDays, amount: round2(d.absenceDays * dayPay) });
  if (c.friMonAbsences) items.push({ label: `Friday / Monday absences: ${c.friMonAbsences}, 2 days each`, days: d.friMonDays, amount: round2(d.friMonDays * dayPay) });
  if (c.lates) items.push({ label: `Lates: ${c.lates}, ${FREE_LATES} allowed, then half a day each`, days: d.lateDays, amount: round2(d.lateDays * dayPay) });
  return {
    ...c,
    workingDays,
    dayPay: round2(dayPay),
    gross: round2(gross),
    days: d.days,
    total: round2(Math.min(d.days * dayPay, Math.max(gross, 0))),
    items,
  };
}

const counts = (r?: { absences: number; friMonAbsences: number; lates: number } | null): MonthCounts | null =>
  r ? { absences: r.absences, friMonAbsences: r.friMonAbsences, lates: r.lates } : null;

export const teacherDeductionsService = {
  async countsFor(teacherId: string, month: number, year: number): Promise<MonthCounts | null> {
    const [row] = await db.select().from(teacherMonthlyAttendance)
      .where(and(eq(teacherMonthlyAttendance.teacherId, teacherId),
        eq(teacherMonthlyAttendance.month, month), eq(teacherMonthlyAttendance.year, year))).limit(1);
    return counts(row);
  },

  /** The deduction on a teacher's salary slip for a month, given the month's gross earnings */
  async summaryFor(teacherId: string, month: number, year: number, gross: number) {
    return calculateDeduction(await this.countsFor(teacherId, month, year), gross, month, year);
  },

  /** Every active teacher with their totals for the month (0 when none entered) */
  async list(filters: { teacherId?: string; month: number; year: number }) {
    const rows = await db
      .select({
        teacherId: users.id,
        teacherName: sql<string>`trim(${users.firstName} || ' ' || ${users.lastName})`,
        absences: sql<number>`coalesce(${teacherMonthlyAttendance.absences}, 0)`,
        friMonAbsences: sql<number>`coalesce(${teacherMonthlyAttendance.friMonAbsences}, 0)`,
        lates: sql<number>`coalesce(${teacherMonthlyAttendance.lates}, 0)`,
      })
      .from(users)
      .leftJoin(teacherMonthlyAttendance, and(eq(teacherMonthlyAttendance.teacherId, users.id),
        eq(teacherMonthlyAttendance.month, filters.month), eq(teacherMonthlyAttendance.year, filters.year)))
      .where(and(eq(users.role, 'teacher'), eq(users.isActive, true),
        filters.teacherId ? eq(users.id, filters.teacherId) : undefined))
      .orderBy(asc(users.firstName), asc(users.lastName));
    return rows.map((r) => {
      const c = { absences: Number(r.absences), friMonAbsences: Number(r.friMonAbsences), lates: Number(r.lates) };
      return { teacherId: r.teacherId, teacherName: r.teacherName, ...c, days: deductionDays(c).days };
    });
  },

  /** Save a teacher's totals for a month (all zero removes the row) */
  async setCounts(input: { teacherId: string; month: number; year: number } & MonthCounts, userId: string) {
    const [teacher] = await db.select({ role: users.role }).from(users).where(eq(users.id, input.teacherId)).limit(1);
    if (!teacher || teacher.role !== 'teacher') throw new AppError(404, 'Teacher not found');
    const where = and(eq(teacherMonthlyAttendance.teacherId, input.teacherId),
      eq(teacherMonthlyAttendance.month, input.month), eq(teacherMonthlyAttendance.year, input.year));
    if (!input.absences && !input.friMonAbsences && !input.lates) {
      await db.delete(teacherMonthlyAttendance).where(where);
    } else {
      await db.insert(teacherMonthlyAttendance).values({ ...input, updatedBy: userId })
        .onConflictDoUpdate({
          target: [teacherMonthlyAttendance.teacherId, teacherMonthlyAttendance.year, teacherMonthlyAttendance.month],
          set: { absences: input.absences, friMonAbsences: input.friMonAbsences, lates: input.lates, updatedBy: userId, updatedAt: new Date() },
        });
    }
    return { ...input, days: deductionDays(input).days };
  },
};

export default teacherDeductionsService;

import { db } from '../config/database';
import { teacherAttendanceMarks } from '../db/schema/teacherAttendanceMarks';
import { users } from '../db/schema/users';
import { and, asc, eq, gte, lte, sql } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import { AppError } from '../middleware/errorHandler';

export type MarkKind = 'absent' | 'late';

/**
 * Junior campus rules (owner, 2026-11-12):
 *  - Day's pay = the month's earnings / Monday-Friday days in the month.
 *  - 2 lates a month are allowed; each late after that costs half a day.
 *  - 2 absences a month are allowed; each absence after that costs 1 day.
 *  - An absence on a Friday or Monday always costs 2 days, even within the
 *    first 2 (it still counts as one of the 2 allowed absences).
 */
export const FREE_LATES = 2;
export const FREE_ABSENCES = 2;

export interface DeductionItem {
  date: string; // YYYY-MM-DD
  kind: MarkKind;
  days: number; // days of pay deducted (0 when allowed)
  amount: number;
  reason: string; // e.g. "3rd absence", "Friday absence", "allowed (1 of 2)"
}

export interface DeductionSummary {
  workingDays: number;
  dayPay: number;
  gross: number; // earnings before deductions
  absences: number;
  lates: number;
  days: number; // total days of pay deducted
  total: number; // amount deducted (never more than gross)
  items: DeductionItem[];
}

const round2 = (n: number) => Math.round(n * 100) / 100;
const ordinal = (n: number) => `${n}${n % 10 === 1 && n % 100 !== 11 ? 'st' : n % 10 === 2 && n % 100 !== 12 ? 'nd' : n % 10 === 3 && n % 100 !== 13 ? 'rd' : 'th'}`;
// Day of week for a YYYY-MM-DD date (0 Sunday ... 6 Saturday), independent of the server timezone
const weekday = (d: string) => new Date(`${d}T12:00:00Z`).getUTCDay();

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

/** Days of pay deducted for each mark, in date order (pure: no database) */
export function deductionDays(marks: { date: string; kind: MarkKind }[]): { date: string; kind: MarkKind; days: number; reason: string }[] {
  let absences = 0;
  let lates = 0;
  return [...marks].sort((a, b) => a.date.localeCompare(b.date)).map((m) => {
    if (m.kind === 'late') {
      lates++;
      return lates <= FREE_LATES
        ? { ...m, days: 0, reason: `allowed (${lates} of ${FREE_LATES})` }
        : { ...m, days: 0.5, reason: `${ordinal(lates)} late` };
    }
    absences++;
    const wd = weekday(m.date);
    if (wd === 1 || wd === 5) return { ...m, days: 2, reason: `${wd === 5 ? 'Friday' : 'Monday'} absence` };
    return absences <= FREE_ABSENCES
      ? { ...m, days: 0, reason: `allowed (${absences} of ${FREE_ABSENCES})` }
      : { ...m, days: 1, reason: `${ordinal(absences)} absence` };
  });
}

/** Deduction for one month's earnings from that month's marks (pure: no database) */
export function calculateDeduction(marks: { date: string; kind: MarkKind }[], gross: number, month: number, year: number): DeductionSummary | null {
  if (!marks.length) return null;
  const workingDays = workingDaysIn(month, year);
  const dayPay = gross > 0 ? gross / workingDays : 0;
  const items = deductionDays(marks).map((m) => ({ ...m, amount: round2(m.days * dayPay) }));
  const days = items.reduce((s, i) => s + i.days, 0);
  return {
    workingDays,
    dayPay: round2(dayPay),
    gross: round2(gross),
    absences: items.filter((i) => i.kind === 'absent').length,
    lates: items.filter((i) => i.kind === 'late').length,
    days,
    total: round2(Math.min(days * dayPay, Math.max(gross, 0))),
    items,
  };
}

const monthRange = (month: number, year: number) => {
  const last = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const mm = String(month).padStart(2, '0');
  return { start: `${year}-${mm}-01`, end: `${year}-${mm}-${String(last).padStart(2, '0')}` };
};

export const teacherDeductionsService = {
  async marksFor(teacherId: string, month: number, year: number) {
    const { start, end } = monthRange(month, year);
    return db.select({ date: teacherAttendanceMarks.date, kind: teacherAttendanceMarks.kind })
      .from(teacherAttendanceMarks)
      .where(and(eq(teacherAttendanceMarks.teacherId, teacherId),
        gte(teacherAttendanceMarks.date, start), lte(teacherAttendanceMarks.date, end)))
      .orderBy(asc(teacherAttendanceMarks.date)) as Promise<{ date: string; kind: MarkKind }[]>;
  },

  /** The deduction on a teacher's invoice for a month, given the month's gross earnings */
  async summaryFor(teacherId: string, month: number, year: number, gross: number) {
    return calculateDeduction(await this.marksFor(teacherId, month, year), gross, month, year);
  },

  async list(filters: { teacherId?: string; month: number; year: number }) {
    const { start, end } = monthRange(filters.month, filters.year);
    const creator = alias(users, 'creator');
    return db
      .select({
        id: teacherAttendanceMarks.id,
        teacherId: teacherAttendanceMarks.teacherId,
        teacherName: sql<string>`trim(${users.firstName} || ' ' || ${users.lastName})`,
        date: teacherAttendanceMarks.date,
        kind: teacherAttendanceMarks.kind,
        note: teacherAttendanceMarks.note,
        createdByName: sql<string | null>`trim(${creator.firstName} || ' ' || ${creator.lastName})`,
      })
      .from(teacherAttendanceMarks)
      .innerJoin(users, eq(users.id, teacherAttendanceMarks.teacherId))
      .leftJoin(creator, eq(creator.id, teacherAttendanceMarks.createdBy))
      .where(and(
        filters.teacherId ? eq(teacherAttendanceMarks.teacherId, filters.teacherId) : undefined,
        gte(teacherAttendanceMarks.date, start), lte(teacherAttendanceMarks.date, end),
      ))
      .orderBy(asc(teacherAttendanceMarks.date));
  },

  async create(input: { teacherId: string; date: string; kind: MarkKind; note?: string }, userId: string) {
    const wd = weekday(input.date);
    if (wd === 0 || wd === 6) throw new AppError(400, 'Absent and late marks are for Monday to Friday only');
    const [teacher] = await db.select({ role: users.role }).from(users).where(eq(users.id, input.teacherId)).limit(1);
    if (!teacher || teacher.role !== 'teacher') throw new AppError(404, 'Teacher not found');
    const [existing] = await db.select({ id: teacherAttendanceMarks.id }).from(teacherAttendanceMarks)
      .where(and(eq(teacherAttendanceMarks.teacherId, input.teacherId), eq(teacherAttendanceMarks.date, input.date))).limit(1);
    if (existing) throw new AppError(400, 'This teacher already has a mark on that day; delete it first to change it');
    const [row] = await db.insert(teacherAttendanceMarks).values({
      teacherId: input.teacherId, date: input.date, kind: input.kind,
      note: input.note?.trim() || null, createdBy: userId,
    }).returning();
    return row;
  },

  async remove(id: string) {
    const [row] = await db.delete(teacherAttendanceMarks).where(eq(teacherAttendanceMarks.id, id)).returning();
    if (!row) throw new AppError(404, 'Mark not found');
    return row;
  },
};

export default teacherDeductionsService;

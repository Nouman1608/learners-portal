import { db } from '../config/database';
import { users, courses, courseTeachers, enrollments } from '../db/schema';
import { invoices, invoiceLineItems } from '../db/schema/invoices';
import { and, eq, inArray, sql } from 'drizzle-orm';
import { invoicesService } from './invoices.service';
import { currencyService, CurrencyCode } from './currency.service';

/*
 * Class profit for one month (sudo analytics): for each class, the fees due and received
 * from its students, what its teacher is paid for it, and the difference.
 *
 * Teacher pay comes from the month's salary slip when it exists. Before the slip is made
 * it is an ESTIMATE: the slip's own calculation run as a preview (nothing saved), so the
 * rules are identical. A fixed monthly salary is not tied to a class, so it is split
 * equally between the teacher's classes (owner's choice).
 *
 * Always this portal's own database: the other campus is asked through its own backend
 * (see campusInternal.routes.ts), because pay rules and rates belong to each instance.
 */

export interface MoneyByCurrency {
  currency: string;
  amount: number;
}

export interface ClassProfit {
  courseId: string;
  title: string;
  teachers: string[];
  students: number;
  due: MoneyByCurrency[]; // fees for the month, in the currency they are billed in
  received: MoneyByCurrency[];
  duePKR: number;
  receivedPKR: number;
  teacherPayPKR: number;
  payEstimated: boolean; // true while any of the class's teachers has no slip yet
  profitPKR: number; // received - teacher pay
  expectedProfitPKR: number; // due - teacher pay (if everyone pays)
  campus?: 'senior' | 'junior';
}

/** Pay that belongs to no class: staff on a salary who teach no class */
export interface UnassignedPay {
  teacherId: string;
  name: string;
  payPKR: number;
  estimated: boolean;
  campus?: 'senior' | 'junior';
}

export interface ClassProfitReport {
  month: number;
  year: number;
  classes: ClassProfit[];
  unassigned: UnassignedPay[];
}

const rateToPKR = (currency: string) => currencyService.getExchangeRate(currency as CurrencyCode)?.rateToPKR ?? 1;
const round = (n: number) => Math.round(n * 100) / 100;

export const classProfitService = {
  async getReport(month: number, year: number): Promise<ClassProfitReport> {
    // 1. Fees per class and currency. Dropped / on-leave fees and 0 placeholders are not owed.
    const feeRows = (await db.execute(sql`
      SELECT f.course_id AS "courseId", c.title, COALESCE(f.currency, 'PKR') AS currency,
             count(DISTINCT f.student_id)::int AS students,
             SUM(f.amount::numeric)::float AS due,
             COALESCE(SUM(f.amount::numeric) FILTER (WHERE f.status = 'received'), 0)::float AS received
      FROM fees f
      INNER JOIN courses c ON c.id = f.course_id
      WHERE f.month = ${month} AND f.year = ${year}
        AND f.status IN ('received', 'pending', 'overdue') AND f.amount::numeric > 0
      GROUP BY f.course_id, c.title, COALESCE(f.currency, 'PKR')`)).rows as any[];

    const classes = new Map<string, ClassProfit>();
    const classFor = (courseId: string, title: string) => {
      let entry = classes.get(courseId);
      if (!entry) {
        entry = {
          courseId, title, teachers: [], students: 0, due: [], received: [],
          duePKR: 0, receivedPKR: 0, teacherPayPKR: 0, payEstimated: false, profitPKR: 0, expectedProfitPKR: 0,
        };
        classes.set(courseId, entry);
      }
      return entry;
    };
    for (const row of feeRows) {
      const entry = classFor(row.courseId, row.title);
      entry.students += row.students;
      entry.due.push({ currency: row.currency, amount: round(row.due) });
      if (row.received > 0) entry.received.push({ currency: row.currency, amount: round(row.received) });
      entry.duePKR += row.due * rateToPKR(row.currency);
      entry.receivedPKR += row.received * rateToPKR(row.currency);
    }

    // 2. Teachers: everyone active, plus anyone who has a slip for the month (may have left since)
    const slips = await db.select().from(invoices).where(and(
      eq(invoices.type, 'teacher'), eq(invoices.isLatest, true), eq(invoices.month, month), eq(invoices.year, year),
    ));
    const slipByTeacher = new Map(slips.map((s) => [s.recipientId, s]));
    const activeTeachers = await db.select().from(users).where(and(eq(users.role, 'teacher'), eq(users.isActive, true)));
    const missing = slips.map((s) => s.recipientId).filter((id) => !activeTeachers.some((t) => t.id === id));
    const teachers = [
      ...activeTeachers,
      ...(missing.length ? await db.select().from(users).where(inArray(users.id, missing)) : []),
    ];

    // Each teacher's classes (with titles), and which of them have students enrolled now
    const teaching = await db
      .select({ teacherId: courseTeachers.teacherId, courseId: courses.id, title: courses.title })
      .from(courseTeachers)
      .innerJoin(courses, eq(courseTeachers.courseId, courses.id));
    const withStudents = new Set((await db
      .selectDistinct({ courseId: enrollments.courseId })
      .from(enrollments)
      .where(eq(enrollments.status, 'active'))).map((r) => r.courseId));

    const unassigned: UnassignedPay[] = [];

    for (const teacher of teachers) {
      const name = `${teacher.firstName} ${teacher.lastName}`;
      const ownClasses = teaching.filter((t) => t.teacherId === teacher.id);
      const slip = slipByTeacher.get(teacher.id);

      // The slip's lines: real ones when the slip exists, otherwise a preview of them
      let lines: { courseId: string | null; amount: string }[];
      let factor = 1; // real slips: scales the lines to the slip's total (absence / late deductions)
      const estimated = !slip;
      if (slip) {
        lines = await db
          .select({ courseId: invoiceLineItems.courseId, amount: invoiceLineItems.amount })
          .from(invoiceLineItems)
          .where(eq(invoiceLineItems.invoiceId, slip.id));
        const gross = lines.reduce((sum, line) => sum + Number(line.amount), 0);
        if (gross > 0) factor = Number(slip.totalAmount) / gross;
      } else {
        try {
          ({ lineItems: lines } = await invoicesService.generateTeacherInvoice({ teacherId: teacher.id, month, year, preview: true }));
        } catch {
          lines = []; // no pay set up, or nothing to pay: no estimate for this teacher
        }
      }

      // A teacher is named on every class of theirs that appears in the report
      const addPay = (courseId: string, title: string, amount: number) => {
        const entry = classFor(courseId, title);
        entry.teacherPayPKR += amount;
        if (estimated) entry.payEstimated = true;
      };

      let noClass = 0; // fixed salary: not tied to a class
      for (const line of lines) {
        const amount = Number(line.amount) * factor;
        const own = line.courseId ? ownClasses.find((c) => c.courseId === line.courseId) : undefined;
        if (line.courseId && (own || classes.has(line.courseId))) {
          addPay(line.courseId, own?.title ?? classes.get(line.courseId)!.title, amount);
        } else {
          noClass += amount;
        }
      }

      if (noClass > 0) {
        // Split equally between the teacher's classes: those with fees this month, else those
        // with students now. A salaried member of staff with no class is listed separately.
        let share = ownClasses.filter((c) => classes.has(c.courseId));
        if (!share.length) share = ownClasses.filter((c) => withStudents.has(c.courseId));
        if (share.length) {
          for (const c of share) addPay(c.courseId, c.title, noClass / share.length);
        } else {
          unassigned.push({ teacherId: teacher.id, name, payPKR: round(noClass), estimated });
        }
      }

      for (const c of ownClasses) {
        const entry = classes.get(c.courseId);
        if (entry && !entry.teachers.includes(name)) entry.teachers.push(name);
      }
    }

    const list = [...classes.values()].map((c) => ({
      ...c,
      duePKR: round(c.duePKR),
      receivedPKR: round(c.receivedPKR),
      teacherPayPKR: round(c.teacherPayPKR),
      profitPKR: round(c.receivedPKR - c.teacherPayPKR),
      expectedProfitPKR: round(c.duePKR - c.teacherPayPKR),
    })).sort((a, b) => b.expectedProfitPKR - a.expectedProfitPKR);

    return { month, year, classes: list, unassigned };
  },
};

export default classProfitService;

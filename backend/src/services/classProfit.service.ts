import { db, Database } from '../config/database';
import { users, courses, courseTeachers, enrollments } from '../db/schema';
import { invoices, invoiceLineItems } from '../db/schema/invoices';
import { and, eq, inArray, sql } from 'drizzle-orm';
import { invoicesService } from './invoices.service';
import { currencyService, CurrencyCode } from './currency.service';
import { feeInBooks, booksStartDate } from '../utils/booksStart';
import teacherOneToOneRates from '../config/teacherOneToOneRates.json';

/*
 * Class finance: the one calculation behind Course profitability, Teacher profitability,
 * the Financial headline boxes and the Course Profit tab. For each class over a run of
 * months (fees are counted by the month they are FOR, never by the day money arrived):
 *
 *   Revenue        what the class brings in when every student has paid
 *     = Invoiced       fees whose date has arrived (a fee paid early counts too)
 *     + Not invoiced   fees dated later in the period, and 1-to-1 classes of the current
 *                      month that are not counted yet (expected classes x fee per class)
 *   Invoiced
 *     = Paid           fees marked received
 *     + Not received   fees whose date has arrived but are not paid yet
 *
 *   Teacher cost   the expected salary slip: the month's slip when it exists, otherwise the
 *                  slip's own calculation run as a preview (nothing saved). A fixed monthly
 *                  salary is split equally between the teacher's classes. 1-to-1 classes not
 *                  counted yet are costed at the teacher's rate x expected classes.
 *
 *   Expected profit = Revenue - Teacher cost      Profit so far = Paid - Teacher cost
 *
 * Dropped / on-leave fees and 0 placeholders are not owed and are left out. Amounts are PKR
 * equivalents at the portal's rates. Months before the books start are left out.
 *
 * The preview can only run against this portal's own database (pay rules and 1-to-1 rates
 * belong to each instance), so when another campus's database is read from here, months
 * without a slip have no teacher cost; the other campus's own backend gives the full figure.
 */

export interface ClassFinance {
  courseId: string;
  title: string;
  teachers: string[];
  teacherIds: string[];
  oneToOne: boolean;
  students: number;
  revenuePKR: number;
  invoicedPKR: number;
  notInvoicedPKR: number;
  paidPKR: number;
  notReceivedPKR: number;
  teacherPayPKR: number;
  estimatedPayPKR: number; // part of teacherPayPKR that is an estimate (no slip yet)
  expectedProfitPKR: number;
  profitSoFarPKR: number;
  campus?: 'senior' | 'junior';
}

export interface TeacherPay {
  teacherId: string;
  name: string;
  payPKR: number; // everything the teacher is paid in the period (slips + estimates)
  estimatedPKR: number;
  slipCount: number;
  unassignedPKR: number; // pay not tied to any class (salaried staff who teach no class)
  campus?: 'senior' | 'junior';
}

export interface ClassFinanceReport {
  classes: ClassFinance[];
  teachers: TeacherPay[];
}

/** The month-by-month Course Profit tab */
export interface ClassProfitReport extends ClassFinanceReport {
  month: number;
  year: number;
}

const rateToPKR = (currency: string | null) => currencyService.getExchangeRate((currency || 'PKR') as CurrencyCode)?.rateToPKR ?? 1;
const round = (n: number) => Math.round(n * 100) / 100;
const pakistanToday = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Karachi' }).format(new Date()); // YYYY-MM-DD
/** A month as one number (year * 12 + month), so months can be compared and stepped through */
const monthIndex = (year: number, month: number) => year * 12 + month;
const fromIndex = (index: number) => ({ year: Math.floor((index - 1) / 12), month: ((index - 1) % 12) + 1 });

export const classProfitService = {
  /** One month, for the Course Profit tab */
  async getReport(month: number, year: number): Promise<ClassProfitReport> {
    const index = monthIndex(year, month);
    return { month, year, ...(await this.getFinance(index, index)) };
  },

  /** A date range, counted by whole months (the Financial tab's From / To) */
  async getFinanceForDates(startDate: Date, endDate: Date, database: Database = db): Promise<ClassFinanceReport> {
    return this.getFinance(
      monthIndex(startDate.getFullYear(), startDate.getMonth() + 1),
      monthIndex(endDate.getFullYear(), endDate.getMonth() + 1),
      database,
    );
  },

  async getFinance(firstMonth: number, lastMonth: number, database: Database = db): Promise<ClassFinanceReport> {
    const today = pakistanToday();
    const [nowYear, nowMonth] = today.split('-').map(Number);
    const thisMonth = monthIndex(nowYear, nowMonth);
    const canPreview = database === db;

    // Months before the books start are left out altogether
    const booksStart = booksStartDate(database);
    if (booksStart) {
      const [y, m] = booksStart.split('-').map(Number);
      firstMonth = Math.max(firstMonth, monthIndex(y, m));
    }
    if (firstMonth > lastMonth) return { classes: [], teachers: [] };

    const feeMonth = sql`(f.year * 12 + f.month)`;
    const owed = sql`f.status IN ('received', 'pending', 'overdue') AND f.amount::numeric > 0
      AND ${feeMonth} BETWEEN ${firstMonth} AND ${lastMonth}`;

    // ---- 1. Fees per class and currency: paid / date arrived but unpaid / date still to come ----
    const feeRows = (await database.execute(sql`
      SELECT f.course_id AS "courseId", c.title, COALESCE(f.currency, 'PKR') AS currency,
             COALESCE(SUM(f.amount::numeric) FILTER (WHERE f.status = 'received'), 0)::float AS paid,
             COALESCE(SUM(f.amount::numeric) FILTER (WHERE f.status <> 'received' AND (f.due_date IS NULL OR f.due_date <= ${today}::date)), 0)::float AS "notReceived",
             COALESCE(SUM(f.amount::numeric) FILTER (WHERE f.status <> 'received' AND f.due_date > ${today}::date), 0)::float AS "notInvoiced"
      FROM fees f
      INNER JOIN courses c ON c.id = f.course_id
      WHERE ${owed}
      GROUP BY f.course_id, c.title, COALESCE(f.currency, 'PKR')`)).rows as any[];
    const studentRows = (await database.execute(sql`
      SELECT f.course_id AS "courseId", count(DISTINCT f.student_id)::int AS students
      FROM fees f WHERE ${owed} GROUP BY f.course_id`)).rows as any[];

    const classes = new Map<string, ClassFinance>();
    const classFor = (courseId: string, title: string) => {
      let entry = classes.get(courseId);
      if (!entry) {
        entry = {
          courseId, title, teachers: [], teacherIds: [], oneToOne: false, students: 0,
          revenuePKR: 0, invoicedPKR: 0, notInvoicedPKR: 0, paidPKR: 0, notReceivedPKR: 0,
          teacherPayPKR: 0, estimatedPayPKR: 0, expectedProfitPKR: 0, profitSoFarPKR: 0,
        };
        classes.set(courseId, entry);
      }
      return entry;
    };
    for (const row of feeRows) {
      const entry = classFor(row.courseId, row.title);
      const rate = rateToPKR(row.currency);
      entry.paidPKR += row.paid * rate;
      entry.notReceivedPKR += row.notReceived * rate;
      entry.notInvoicedPKR += row.notInvoiced * rate;
    }
    for (const row of studentRows) {
      const entry = classes.get(row.courseId);
      if (entry) entry.students = row.students;
    }

    // ---- 2. 1-to-1 classes: this month's classes not counted yet are expected, not invoiced ----
    const oneToOne = await database
      .select({
        enrollmentId: enrollments.id,
        courseId: enrollments.courseId,
        title: courses.title,
        status: enrollments.status,
        perSessionFee: enrollments.perSessionFee,
        expectedClasses: enrollments.expectedClassesPerMonth,
        currency: enrollments.currency,
      })
      .from(enrollments)
      .innerJoin(courses, eq(enrollments.courseId, courses.id))
      .where(eq(enrollments.classType, '1-to-1'));
    for (const enrollment of oneToOne) {
      const entry = classes.get(enrollment.courseId);
      if (entry) entry.oneToOne = true;
    }

    // enrolment -> expected classes this month, for the teacher's side below
    const expectedByCourse = new Map<string, number>();
    if (thisMonth >= firstMonth && thisMonth <= lastMonth) {
      const counted = new Set(((await database.execute(sql`
        SELECT DISTINCT f.enrollment_id AS id FROM fees f
        WHERE f.status IN ('received', 'pending', 'overdue') AND f.amount::numeric > 0
          AND f.year = ${nowYear} AND f.month = ${nowMonth}`)).rows as any[]).map((r) => r.id));
      for (const enrollment of oneToOne) {
        const perSession = parseFloat(enrollment.perSessionFee || '0');
        if (enrollment.status !== 'active' || counted.has(enrollment.enrollmentId) || !(perSession > 0) || !enrollment.expectedClasses) continue;
        const entry = classFor(enrollment.courseId, enrollment.title);
        entry.oneToOne = true;
        entry.notInvoicedPKR += perSession * enrollment.expectedClasses * rateToPKR(enrollment.currency);
        entry.students += 1;
        expectedByCourse.set(enrollment.courseId, (expectedByCourse.get(enrollment.courseId) || 0) + enrollment.expectedClasses);
      }
    }

    // ---- 3. Teachers' pay: each month's slip, or a preview of it while there is none ----
    const slips = await database.select().from(invoices).where(and(
      eq(invoices.type, 'teacher'),
      eq(invoices.isLatest, true),
      sql`(${invoices.year} * 12 + ${invoices.month}) BETWEEN ${firstMonth} AND ${lastMonth}`,
      feeInBooks(database, invoices.year, invoices.month),
    ));
    const slipLines = slips.length
      ? await database
          .select({ invoiceId: invoiceLineItems.invoiceId, courseId: invoiceLineItems.courseId, amount: invoiceLineItems.amount })
          .from(invoiceLineItems)
          .where(inArray(invoiceLineItems.invoiceId, slips.map((s) => s.id)))
      : [];

    const activeTeachers = await database.select().from(users).where(and(eq(users.role, 'teacher'), eq(users.isActive, true)));
    const others = [...new Set(slips.map((s) => s.recipientId))].filter((id) => !activeTeachers.some((t) => t.id === id));
    const allTeachers = [...activeTeachers, ...(others.length ? await database.select().from(users).where(inArray(users.id, others)) : [])];

    const teaching = await database
      .select({ teacherId: courseTeachers.teacherId, courseId: courses.id, title: courses.title })
      .from(courseTeachers)
      .innerJoin(courses, eq(courseTeachers.courseId, courses.id));
    const withStudents = new Set((await database
      .selectDistinct({ courseId: enrollments.courseId })
      .from(enrollments)
      .where(eq(enrollments.status, 'active'))).map((r) => r.courseId));

    const teachers: TeacherPay[] = [];
    // Estimates run from the first month to this month: later months have no classes to pay for yet
    const lastPayMonth = Math.min(lastMonth, thisMonth);

    for (const teacher of allTeachers) {
      const name = `${teacher.firstName} ${teacher.lastName}`;
      const ownClasses = teaching.filter((t) => t.teacherId === teacher.id);
      const pay: TeacherPay = { teacherId: teacher.id, name, payPKR: 0, estimatedPKR: 0, slipCount: 0, unassignedPKR: 0 };
      const addPay = (courseId: string, title: string, amount: number, estimated: boolean) => {
        const entry = classFor(courseId, title);
        entry.teacherPayPKR += amount;
        if (estimated) entry.estimatedPayPKR += amount;
      };
      let noClass = 0; // fixed salary: not tied to a class
      let noClassEstimated = 0;
      let thisMonthCourses: Set<string> | null = null; // classes on this month's slip / preview

      for (let index = firstMonth; index <= lastPayMonth; index++) {
        const { year, month } = fromIndex(index);
        const slip = slips.find((s) => s.recipientId === teacher.id && s.year === year && s.month === month);

        let lines: { courseId: string | null; amount: string }[];
        let factor = 1; // a real slip: scale its lines to the slip's total (absence / late deductions)
        if (slip) {
          lines = slipLines.filter((line) => line.invoiceId === slip.id);
          const gross = lines.reduce((sum, line) => sum + Number(line.amount), 0);
          if (gross > 0) factor = Number(slip.totalAmount) / gross;
          pay.slipCount += 1;
        } else if (canPreview && teacher.isActive) {
          try {
            ({ lineItems: lines } = await invoicesService.generateTeacherInvoice({ teacherId: teacher.id, month, year, preview: true }));
          } catch {
            lines = []; // no pay set up, or nothing to pay: no estimate for this teacher
          }
        } else {
          lines = [];
        }
        if (index === thisMonth) thisMonthCourses = new Set(lines.map((line) => line.courseId).filter((id): id is string => !!id));

        for (const line of lines) {
          const amount = Number(line.amount) * factor;
          pay.payPKR += amount;
          if (!slip) pay.estimatedPKR += amount;
          const own = line.courseId ? ownClasses.find((c) => c.courseId === line.courseId) : undefined;
          if (line.courseId && (own || classes.has(line.courseId))) {
            addPay(line.courseId, own?.title ?? classes.get(line.courseId)!.title, amount, !slip);
          } else {
            noClass += amount;
            if (!slip) noClassEstimated += amount;
          }
        }
      }

      // 1-to-1 classes of this month that are not counted yet: the teacher is paid per class
      // taken, so expect the same classes the student is expected to be invoiced for
      if (teacher.teacherPaymentType !== 'salaried' && thisMonthCourses) {
        for (const course of ownClasses) {
          const expectedClasses = expectedByCourse.get(course.courseId);
          if (!expectedClasses || thisMonthCourses.has(course.courseId)) continue;
          if (teaching.find((t) => t.courseId === course.courseId)?.teacherId !== teacher.id) continue; // first teacher only
          const rate = (teacherOneToOneRates as Record<string, number>)[teacher.id] ?? teacherOneToOneRates.default;
          if (!Number.isFinite(rate)) continue;
          const amount = rate * expectedClasses;
          pay.payPKR += amount;
          pay.estimatedPKR += amount;
          addPay(course.courseId, course.title, amount, true);
        }
      }

      if (noClass > 0) {
        // Split equally between the teacher's classes: those in the report, else those with
        // students now. Salaried staff with no class keep their pay unassigned.
        let share = ownClasses.filter((c) => classes.has(c.courseId));
        if (!share.length) share = ownClasses.filter((c) => withStudents.has(c.courseId));
        if (share.length) {
          for (const c of share) {
            addPay(c.courseId, c.title, (noClass - noClassEstimated) / share.length, false);
            if (noClassEstimated) addPay(c.courseId, c.title, noClassEstimated / share.length, true);
          }
        } else {
          pay.unassignedPKR = round(noClass);
        }
      }

      for (const c of ownClasses) {
        const entry = classes.get(c.courseId);
        if (entry && !entry.teacherIds.includes(teacher.id)) {
          entry.teacherIds.push(teacher.id);
          entry.teachers.push(name);
        }
      }
      if (pay.payPKR > 0 || ownClasses.some((c) => classes.has(c.courseId))) {
        teachers.push({ ...pay, payPKR: round(pay.payPKR), estimatedPKR: round(pay.estimatedPKR) });
      }
    }

    const oneToOneCourses = new Set(oneToOne.map((e) => e.courseId));
    const list = [...classes.values()].map((c) => {
      const invoiced = c.paidPKR + c.notReceivedPKR;
      const revenue = invoiced + c.notInvoicedPKR;
      return {
        ...c,
        oneToOne: oneToOneCourses.has(c.courseId), // also classes that only have teacher pay so far
        revenuePKR: round(revenue),
        invoicedPKR: round(invoiced),
        notInvoicedPKR: round(c.notInvoicedPKR),
        paidPKR: round(c.paidPKR),
        notReceivedPKR: round(c.notReceivedPKR),
        teacherPayPKR: round(c.teacherPayPKR),
        estimatedPayPKR: round(c.estimatedPayPKR),
        expectedProfitPKR: round(revenue - c.teacherPayPKR),
        profitSoFarPKR: round(c.paidPKR - c.teacherPayPKR),
      };
    }).sort((a, b) => b.expectedProfitPKR - a.expectedProfitPKR);

    return { classes: list, teachers };
  },
};

export default classProfitService;

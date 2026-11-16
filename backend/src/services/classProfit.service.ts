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
 * without a slip would have no teacher cost. The other campus's figures are therefore asked of
 * its own backend (/internal/campus/class-profit and /internal/campus/profitability).
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
  isActive: boolean; // a teacher who has left is paid for the months worked but is not listed as a teacher
  campus?: 'senior' | 'junior';
}

export interface ClassFinanceReport {
  classes: ClassFinance[];
  teachers: TeacherPay[];
  /** Only when a class was asked for: that class, student by student */
  detail?: StudentFinance[];
  /** Only when every class was asked for ('all'): each class's students, by course id */
  details?: Record<string, StudentFinance[]>;
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

/** One student's share of a class's figures (the class row, broken down by student) */
export interface StudentFinance {
  studentId: string | null; // null = pay that could not be tied to a student of the class
  firstName: string;
  lastName: string;
  revenuePKR: number;
  invoicedPKR: number;
  notInvoicedPKR: number;
  paidPKR: number;
  notReceivedPKR: number;
  teacherPayPKR: number;
  estimatedPayPKR: number;
  sharedPayPKR: number; // part of the teacher pay not paid per student (e.g. a fixed salary), split equally
  expectedProfitPKR: number;
  profitSoFarPKR: number;
  campus?: 'senior' | 'junior';
}

/** One student in one class: a line of the student-wise export */
export interface StudentBreakdownRow extends StudentFinance {
  courseId: string;
  courseTitle: string;
  teachers: string[];
  oneToOne: boolean;
}

/** One fee behind a figure of the profitability tables */
export interface FinanceFee {
  feeId: string;
  studentId: string;
  firstName: string;
  lastName: string;
  courseId: string;
  classTitle: string;
  amount: string;
  currency: string;
  feeStatus: 'received' | 'pending' | 'overdue';
  dueDate: string | null;
  month: number;
  year: number;
  campus?: 'senior' | 'junior';
}

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

  /**
   * The fees behind one figure of the profitability tables, for the same months and by the
   * same rules as getFinance: 'received' (paid), 'notReceived' (fee date has arrived, not
   * paid) or 'notInvoiced' (fee dated later). For one class (courseId), one teacher's
   * classes, or with teacherId null the classes that have no teacher. One line per fee.
   */
  async getFeeList(
    filter: { startDate: Date; endDate: Date; group: 'received' | 'notReceived' | 'notInvoiced'; teacherId?: string | null; courseId?: string },
    database: Database = db,
  ): Promise<FinanceFee[]> {
    const today = pakistanToday();
    let firstMonth = monthIndex(filter.startDate.getFullYear(), filter.startDate.getMonth() + 1);
    const lastMonth = monthIndex(filter.endDate.getFullYear(), filter.endDate.getMonth() + 1);
    const booksStart = booksStartDate(database);
    if (booksStart) {
      const [y, m] = booksStart.split('-').map(Number);
      firstMonth = Math.max(firstMonth, monthIndex(y, m));
    }
    if (firstMonth > lastMonth) return [];

    const group = {
      received: sql`f.status = 'received'`,
      notReceived: sql`f.status <> 'received' AND (f.due_date IS NULL OR f.due_date <= ${today}::date)`,
      notInvoiced: sql`f.status <> 'received' AND f.due_date > ${today}::date`,
    }[filter.group];
    // One class, or one teacher's classes (teacherId null = classes with no teacher)
    const teaches = filter.courseId
      ? sql`f.course_id = ${filter.courseId}`
      : filter.teacherId
        ? sql`EXISTS (SELECT 1 FROM course_teachers ct WHERE ct.course_id = f.course_id AND ct.teacher_id = ${filter.teacherId})`
        : sql`NOT EXISTS (SELECT 1 FROM course_teachers ct WHERE ct.course_id = f.course_id)`;

    return (await database.execute(sql`
      SELECT f.id AS "feeId", u.id AS "studentId", u.first_name AS "firstName", u.last_name AS "lastName",
             c.id AS "courseId", c.title AS "classTitle",
             f.amount, COALESCE(f.currency, 'PKR') AS currency, f.status AS "feeStatus",
             to_char(f.due_date, 'YYYY-MM-DD') AS "dueDate", f.month, f.year
      FROM fees f
      INNER JOIN users u ON u.id = f.student_id
      INNER JOIN courses c ON c.id = f.course_id
      WHERE f.status IN ('received', 'pending', 'overdue') AND f.amount::numeric > 0
        AND (f.year * 12 + f.month) BETWEEN ${firstMonth} AND ${lastMonth}
        AND ${group} AND ${teaches}
      ORDER BY u.first_name, u.last_name, f.year, f.month, c.title`)).rows as unknown as FinanceFee[];
  },

  /**
   * One class student by student, for the same months and by the same calculation as its row
   * in the table, so the students add up to the row. Teacher pay that is not paid per student
   * (a fixed salary's share, expected 1-to-1 classes) is split equally between the students.
   */
  async getClassBreakdown(courseId: string, startDate: Date, endDate: Date, database: Database = db): Promise<StudentFinance[]> {
    const report = await this.getFinance(
      monthIndex(startDate.getFullYear(), startDate.getMonth() + 1),
      monthIndex(endDate.getFullYear(), endDate.getMonth() + 1),
      database,
      courseId,
    );
    return report.detail ?? [];
  },

  /**
   * Every class student by student in one pass: the Course profitability table as one line
   * per student (the student-wise Excel export). Each class's students add up to its row.
   */
  async getStudentBreakdown(startDate: Date, endDate: Date, database: Database = db): Promise<StudentBreakdownRow[]> {
    const report = await this.getFinance(
      monthIndex(startDate.getFullYear(), startDate.getMonth() + 1),
      monthIndex(endDate.getFullYear(), endDate.getMonth() + 1),
      database,
      'all',
    );
    return report.classes.flatMap((c) => (report.details?.[c.courseId] ?? []).map((student) => ({
      courseId: c.courseId, courseTitle: c.title, teachers: c.teachers, oneToOne: c.oneToOne, ...student,
    })));
  },

  async getFinance(firstMonth: number, lastMonth: number, database: Database = db, detailCourseId?: string): Promise<ClassFinanceReport> {
    // detailCourseId: one class to break down by student, or 'all' for every class
    const wantsDetail = (courseId: string) => detailCourseId === 'all' || detailCourseId === courseId;
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
        studentId: enrollments.studentId,
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
    const detailExpected = new Map<string, Map<string, number>>(); // class -> student -> expected invoice (PKR)
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
        const expectedPKR = perSession * enrollment.expectedClasses * rateToPKR(enrollment.currency);
        entry.notInvoicedPKR += expectedPKR;
        entry.students += 1;
        if (wantsDetail(enrollment.courseId)) {
          const byStudent = detailExpected.get(enrollment.courseId) ?? new Map<string, number>();
          byStudent.set(enrollment.studentId, (byStudent.get(enrollment.studentId) || 0) + expectedPKR);
          detailExpected.set(enrollment.courseId, byStudent);
        }
        expectedByCourse.set(enrollment.courseId, (expectedByCourse.get(enrollment.courseId) || 0) + enrollment.expectedClasses);
      }
    }

    // ---- 3. Teachers' pay: each month's slip, or a preview of it while there is none ----
    const slips = await database.select().from(invoices).where(and(
      inArray(invoices.type, ['teacher', 'teacher_1to1']), // a permanent teacher's 1-to-1 slip is a slip of its own
      eq(invoices.isLatest, true),
      sql`(${invoices.year} * 12 + ${invoices.month}) BETWEEN ${firstMonth} AND ${lastMonth}`,
      feeInBooks(database, invoices.year, invoices.month),
    ));
    const slipLines = slips.length
      ? await database
          .select({ invoiceId: invoiceLineItems.invoiceId, courseId: invoiceLineItems.courseId, amount: invoiceLineItems.amount, metadata: invoiceLineItems.metadata })
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
    // The asked-for class: teacher pay per student name as written on the slip lines; '' = pay not
    // per student (salary share, expected 1-to-1 classes)
    const detailPay = new Map<string, Map<string, { amount: number; estimated: number }>>(); // class -> student name -> pay
    const noteDetailPay = (courseId: string, studentName: string, amount: number, estimated: boolean) => {
      if (!wantsDetail(courseId)) return;
      const byName = detailPay.get(courseId) ?? new Map<string, { amount: number; estimated: number }>();
      const key = studentName.trim().toLowerCase();
      const entry = byName.get(key) ?? { amount: 0, estimated: 0 };
      entry.amount += amount;
      if (estimated) entry.estimated += amount;
      byName.set(key, entry);
      detailPay.set(courseId, byName);
    };
    // Estimates run from the first month to this month: later months have no classes to pay for yet
    const lastPayMonth = Math.min(lastMonth, thisMonth);

    for (const teacher of allTeachers) {
      const name = `${teacher.firstName} ${teacher.lastName}`;
      const ownClasses = teaching.filter((t) => t.teacherId === teacher.id);
      const pay: TeacherPay = { teacherId: teacher.id, name, payPKR: 0, estimatedPKR: 0, slipCount: 0, unassignedPKR: 0, isActive: teacher.isActive };
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
        // A teacher can have two slips for a month: the ordinary one, and (permanent salary only)
        // a separate 1-to-1 slip. Each is a real slip, or a preview of it while there is none.
        const monthSlips = slips.filter((s) => s.recipientId === teacher.id && s.year === year && s.month === month);
        const sources: { lines: { courseId: string | null; amount: string; metadata?: unknown }[]; factor: number; real: boolean }[] = [];
        for (const slip of monthSlips) {
          const lines = slipLines.filter((line) => line.invoiceId === slip.id);
          let factor = 1; // a real slip: scale its lines to the slip's total (absence / late deductions)
          const gross = lines.reduce((sum, line) => sum + Number(line.amount), 0);
          if (gross > 0) factor = Number(slip.totalAmount) / gross;
          sources.push({ lines, factor, real: true });
          if (slip.type === 'teacher') pay.slipCount += 1;
        }
        if (canPreview && teacher.isActive) {
          const kinds: boolean[] = []; // oneToOneOnly flags still to preview
          if (!monthSlips.some((s) => s.type === 'teacher')) kinds.push(false);
          if (teacher.teacherPaymentType === 'salaried' && !monthSlips.some((s) => s.type === 'teacher_1to1')) kinds.push(true);
          for (const oneToOneOnly of kinds) {
            try {
              const { lineItems } = await invoicesService.generateTeacherInvoice({ teacherId: teacher.id, month, year, preview: true, oneToOneOnly });
              sources.push({ lines: lineItems, factor: 1, real: false });
            } catch {
              // no pay set up, or nothing to pay: no estimate for this slip
            }
          }
        }
        if (index === thisMonth) thisMonthCourses = new Set(sources.flatMap((s) => s.lines.map((line) => line.courseId)).filter((id): id is string => !!id));

        for (const { lines, factor, real } of sources) {
          for (const line of lines) {
            const amount = Number(line.amount) * factor;
            pay.payPKR += amount;
            if (!real) pay.estimatedPKR += amount;
            const own = line.courseId ? ownClasses.find((c) => c.courseId === line.courseId) : undefined;
            if (line.courseId && (own || classes.has(line.courseId))) {
              addPay(line.courseId, own?.title ?? classes.get(line.courseId)!.title, amount, !real);
              noteDetailPay(line.courseId, String((line.metadata as { studentName?: string } | null)?.studentName ?? ''), amount, !real);
            } else {
              noClass += amount;
              if (!real) noClassEstimated += amount;
            }
          }
        }
      }

      // 1-to-1 classes of this month that are not counted yet: the teacher is paid per class
      // taken, so expect the same classes the student is expected to be invoiced for
      // (permanent-salary teachers too: their 1-to-1 classes are paid per class on the separate slip)
      if (thisMonthCourses) {
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
          noteDetailPay(course.courseId, '', amount, true);
        }
      }

      if (noClass > 0) {
        // Split equally between the teacher's classes: those in the report, else those with
        // students now. Salaried staff with no class keep their pay unassigned.
        // The fixed salary is shared between the group classes only: 1-to-1 classes carry their
        // own per-class pay (owner rule, Nov 2026). With no group class it falls back to all.
        const oneToOneIds = new Set(oneToOne.map((e) => e.courseId));
        const groupOnly = (list: typeof ownClasses) => (list.some((c) => !oneToOneIds.has(c.courseId)) ? list.filter((c) => !oneToOneIds.has(c.courseId)) : list);
        let share = groupOnly(ownClasses.filter((c) => classes.has(c.courseId)));
        if (!share.length) share = groupOnly(ownClasses.filter((c) => withStudents.has(c.courseId)));
        if (share.length) {
          for (const c of share) {
            addPay(c.courseId, c.title, (noClass - noClassEstimated) / share.length, false);
            noteDetailPay(c.courseId, '', (noClass - noClassEstimated) / share.length, false);
            if (noClassEstimated) {
              addPay(c.courseId, c.title, noClassEstimated / share.length, true);
              noteDetailPay(c.courseId, '', noClassEstimated / share.length, true);
            }
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

    if (!detailCourseId) return { classes: list, teachers };

    // ---- The asked-for class(es), student by student ----
    const studentFees = (await database.execute(sql`
      SELECT f.course_id AS "courseId", u.id AS "studentId", u.first_name AS "firstName", u.last_name AS "lastName", COALESCE(f.currency, 'PKR') AS currency,
             COALESCE(SUM(f.amount::numeric) FILTER (WHERE f.status = 'received'), 0)::float AS paid,
             COALESCE(SUM(f.amount::numeric) FILTER (WHERE f.status <> 'received' AND (f.due_date IS NULL OR f.due_date <= ${today}::date)), 0)::float AS "notReceived",
             COALESCE(SUM(f.amount::numeric) FILTER (WHERE f.status <> 'received' AND f.due_date > ${today}::date), 0)::float AS "notInvoiced"
      FROM fees f
      INNER JOIN users u ON u.id = f.student_id
      WHERE ${owed} AND ${detailCourseId === 'all' ? sql`true` : sql`f.course_id = ${detailCourseId}`}
      GROUP BY f.course_id, u.id, u.first_name, u.last_name, COALESCE(f.currency, 'PKR')`)).rows as any[];

    const expectedIds = [...new Set([...detailExpected.values()].flatMap((byStudent) => [...byStudent.keys()]))];
    const expectedStudents = expectedIds.length
      ? await database.select({ id: users.id, firstName: users.firstName, lastName: users.lastName }).from(users).where(inArray(users.id, expectedIds))
      : [];

    const detailFor = (courseId: string): StudentFinance[] => {
      const students = new Map<string, StudentFinance>();
      const studentFor = (studentId: string, firstName: string, lastName: string) => {
        let row = students.get(studentId);
        if (!row) {
          row = {
            studentId, firstName, lastName, revenuePKR: 0, invoicedPKR: 0, notInvoicedPKR: 0, paidPKR: 0, notReceivedPKR: 0,
            teacherPayPKR: 0, estimatedPayPKR: 0, sharedPayPKR: 0, expectedProfitPKR: 0, profitSoFarPKR: 0,
          };
          students.set(studentId, row);
        }
        return row;
      };
      for (const fee of studentFees) {
        if (fee.courseId !== courseId) continue;
        const row = studentFor(fee.studentId, fee.firstName, fee.lastName);
        const rate = rateToPKR(fee.currency);
        row.paidPKR += fee.paid * rate;
        row.notReceivedPKR += fee.notReceived * rate;
        row.notInvoicedPKR += fee.notInvoiced * rate;
      }
      for (const [studentId, expectedPKR] of detailExpected.get(courseId) ?? []) {
        const student = expectedStudents.find((u) => u.id === studentId);
        if (student) studentFor(student.id, student.firstName, student.lastName).notInvoicedPKR += expectedPKR;
      }

      // Teacher pay: slip lines name the student; whatever names no student of the class is shared
      let shared = 0;
      let sharedEstimated = 0;
      for (const [name, pay] of detailPay.get(courseId) ?? []) {
        const row = name ? [...students.values()].find((st) => `${st.firstName} ${st.lastName}`.trim().toLowerCase() === name) : undefined;
        if (row) {
          row.teacherPayPKR += pay.amount;
          row.estimatedPayPKR += pay.estimated;
        } else {
          shared += pay.amount;
          sharedEstimated += pay.estimated;
        }
      }
      if (shared > 0) {
        if (students.size === 0) {
          const row = studentFor('none', 'Teacher pay not tied to a student', '');
          row.studentId = null;
        }
        for (const row of students.values()) {
          row.teacherPayPKR += shared / students.size;
          row.estimatedPayPKR += sharedEstimated / students.size;
          row.sharedPayPKR += shared / students.size;
        }
      }

      return [...students.values()].map((st) => {
        const invoiced = st.paidPKR + st.notReceivedPKR;
        const revenue = invoiced + st.notInvoicedPKR;
        return {
          ...st,
          revenuePKR: round(revenue),
          invoicedPKR: round(invoiced),
          notInvoicedPKR: round(st.notInvoicedPKR),
          paidPKR: round(st.paidPKR),
          notReceivedPKR: round(st.notReceivedPKR),
          teacherPayPKR: round(st.teacherPayPKR),
          estimatedPayPKR: round(st.estimatedPayPKR),
          sharedPayPKR: round(st.sharedPayPKR),
          expectedProfitPKR: round(revenue - st.teacherPayPKR),
          profitSoFarPKR: round(st.paidPKR - st.teacherPayPKR),
        };
      }).sort((a, b) => `${a.firstName} ${a.lastName}`.localeCompare(`${b.firstName} ${b.lastName}`));
    };

    if (detailCourseId === 'all') {
      const details: Record<string, StudentFinance[]> = {};
      for (const c of list) details[c.courseId] = detailFor(c.courseId);
      return { classes: list, teachers, details };
    }
    return { classes: list, teachers, detail: detailFor(detailCourseId) };
  },
};

export default classProfitService;

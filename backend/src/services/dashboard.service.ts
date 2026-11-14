import { db, Database } from '../config/database';
import { users } from '../db/schema/users';
import { courses, courseEvents } from '../db/schema/courses';
import { enrollments, fees } from '../db/schema/enrollments';
import { eq, and, gte, sql } from 'drizzle-orm';
import { format } from 'date-fns';
import { feeInBooks } from '../utils/booksStart';

const formatDate = (date: Date): string => format(date, 'yyyy-MM-dd');

export interface CurrencyAmount {
  currency: string;
  amount: string;
}

export interface DashboardStats {
  totalUsers: number;
  totalCourses: number;
  activeStudents: number;
  totalTeachers: number;
  activeEnrollments: number;
  pendingFees: number;
  totalFeeAmount: string; // Deprecated - kept for backward compatibility
  totalFeesByCurrency: CurrencyAmount[]; // New field for multi-currency support
  paidFeesThisMonth: number;
  paidFeesAmountThisMonth: CurrencyAmount[];
  upcomingClasses: number;
  recentActivity?: {
    recentEnrollments: number;
    recentFees: number;
  };
}

/** Students and fees in one state (all / paid / pending / overdue) for a month */
export interface FeeGroup {
  students: number;
  fees: number;
  amounts: CurrencyAmount[]; // per currency, never added across currencies
}

export interface ClassFeeOverview {
  courseId: string;
  title: string;
  enrolled: number; // students enrolled in the class now
  paid: number;
  pending: number;
  overdue: number;
}

export interface TeacherFeeOverview extends Omit<ClassFeeOverview, 'courseId' | 'title'> {
  teacherId: string;
  name: string;
  campus?: 'senior' | 'junior'; // set when both campuses are shown together
  classes: ClassFeeOverview[];
}

export interface FeeOverview {
  month: number;
  year: number;
  total: FeeGroup;
  paid: FeeGroup;
  pending: FeeGroup;
  overdue: FeeGroup;
  teachers: TeacherFeeOverview[];
}

/** Which number of the fee overview was clicked */
export type FeeOverviewStatus = 'total' | 'enrolled' | 'paid' | 'pending' | 'overdue' | 'nofee';

/** One student in one class, behind a number of the fee overview */
export interface FeeOverviewStudent {
  studentId: string;
  firstName: string;
  lastName: string;
  courseId: string;
  classTitle: string;
  feeId: string | null; // the month's fee, for marking it as received
  amount: string | null; // null = no fee owed that month
  currency: string | null;
  feeStatus: 'received' | 'pending' | 'overdue' | null;
  dueDate: string | null;
  campus?: 'senior' | 'junior';
}

export interface RoleSpecificStats {
  student?: {
    myEnrollments: number;
    myPendingFees: number;
    myTotalDue: string; // Deprecated - kept for backward compatibility
    myTotalDueByCurrency: CurrencyAmount[]; // New field for multi-currency support
    upcomingClasses: number;
    projected1to1Fees: CurrencyAmount[]; // Projected monthly fees from 1-to-1 enrollments
  };
  teacher?: {
    myCourses: number;
    myStudents: number;
    upcomingClasses: number;
  };
}

export const dashboardService = {
  /**
   * Get general dashboard stats (admin/sudo)
   */
  async getGeneralStats(database: Database = db): Promise<DashboardStats> {
    // Total users
    const [totalUsersResult] = await database
      .select({ count: sql<number>`count(*)::int` })
      .from(users)
      .where(eq(users.isActive, true));

    const totalUsers = totalUsersResult?.count || 0;

    // Total courses
    const [totalCoursesResult] = await database
      .select({ count: sql<number>`count(*)::int` })
      .from(courses)
      .where(eq(courses.isActive, true));

    const totalCourses = totalCoursesResult?.count || 0;

    // Active students
    const [activeStudentsResult] = await database
      .select({ count: sql<number>`count(*)::int` })
      .from(users)
      .where(and(eq(users.role, 'student'), eq(users.isActive, true)));

    const activeStudents = activeStudentsResult?.count || 0;

    // Total teachers
    const [totalTeachersResult] = await database
      .select({ count: sql<number>`count(*)::int` })
      .from(users)
      .where(and(eq(users.role, 'teacher'), eq(users.isActive, true)));

    const totalTeachers = totalTeachersResult?.count || 0;

    // Active enrollments
    const [activeEnrollmentsResult] = await database
      .select({ count: sql<number>`count(*)::int` })
      .from(enrollments)
      .where(eq(enrollments.status, 'active'));

    const activeEnrollments = activeEnrollmentsResult?.count || 0;

    // Pending fees
    const [pendingFeesResult] = await database
      .select({ count: sql<number>`count(*)::int` })
      .from(fees)
      .where(and(eq(fees.status, 'pending'), feeInBooks(database)));

    const pendingFees = pendingFeesResult?.count || 0;

    // Total fee amount (pending + overdue) - Deprecated but kept for backward compatibility
    const [totalFeeAmountResult] = await database
      .select({ sum: sql<string>`COALESCE(SUM(amount::numeric), 0)` })
      .from(fees)
      .where(and(sql`${fees.status} IN ('pending', 'overdue')`, feeInBooks(database)));

    const totalFeeAmount = totalFeeAmountResult?.sum || '0';

    // Total fees by currency (pending + overdue)
    const totalFeesByCurrencyResult = await database
      .select({
        currency: sql<string>`COALESCE(${fees.currency}, 'PKR')`,
        amount: sql<string>`COALESCE(SUM(amount::numeric), 0)`,
      })
      .from(fees)
      .where(and(sql`${fees.status} IN ('pending', 'overdue')`, feeInBooks(database)))
      .groupBy(sql`COALESCE(${fees.currency}, 'PKR')`);

    const totalFeesByCurrency: CurrencyAmount[] = totalFeesByCurrencyResult.map(row => ({
      currency: row.currency,
      amount: row.amount,
    }));

    // Paid fees this month (status = 'received', current month/year)
    const currentMonth = new Date().getMonth() + 1; // 1-12
    const currentYear = new Date().getFullYear();

    const [paidFeesCountResult] = await database
      .select({ count: sql<number>`count(*)::int` })
      .from(fees)
      .where(and(
        eq(fees.status, 'received'),
        eq(fees.month, currentMonth),
        eq(fees.year, currentYear)
      ));

    const paidFeesThisMonth = paidFeesCountResult?.count || 0;

    const paidFeesAmountResult = await database
      .select({
        currency: sql<string>`COALESCE(${fees.currency}, 'PKR')`,
        amount: sql<string>`COALESCE(SUM(amount::numeric), 0)`,
      })
      .from(fees)
      .where(and(
        eq(fees.status, 'received'),
        eq(fees.month, currentMonth),
        eq(fees.year, currentYear)
      ))
      .groupBy(sql`COALESCE(${fees.currency}, 'PKR')`);

    const paidFeesAmountThisMonth: CurrencyAmount[] = paidFeesAmountResult.map(row => ({
      currency: row.currency,
      amount: row.amount,
    }));

    // Upcoming classes (next 7 days)
    const today = new Date();
    const nextWeek = new Date();
    nextWeek.setDate(nextWeek.getDate() + 7);

    const [upcomingClassesResult] = await database
      .select({ count: sql<number>`count(*)::int` })
      .from(courseEvents)
      .where(
        and(
          eq(courseEvents.status, 'scheduled'),
          gte(courseEvents.eventDate, formatDate(today)),
          sql`${courseEvents.eventDate} <= ${formatDate(nextWeek)}`
        )
      );

    const upcomingClasses = upcomingClassesResult?.count || 0;

    // Recent activity (last 7 days)
    const lastWeek = new Date();
    lastWeek.setDate(lastWeek.getDate() - 7);

    const [recentEnrollmentsResult] = await database
      .select({ count: sql<number>`count(*)::int` })
      .from(enrollments)
      .where(gte(enrollments.enrolledAt, lastWeek));

    const recentEnrollments = recentEnrollmentsResult?.count || 0;

    const [recentFeesResult] = await database
      .select({ count: sql<number>`count(*)::int` })
      .from(fees)
      .where(gte(fees.createdAt, lastWeek));

    const recentFees = recentFeesResult?.count || 0;

    return {
      totalUsers,
      totalCourses,
      activeStudents,
      totalTeachers,
      activeEnrollments,
      pendingFees,
      totalFeeAmount,
      totalFeesByCurrency,
      paidFeesThisMonth,
      paidFeesAmountThisMonth,
      upcomingClasses,
      recentActivity: {
        recentEnrollments,
        recentFees,
      },
    };
  },

  /**
   * Senior + Junior Campus stats for the sudo dashboard. Counts are added; money is added per
   * currency only, never across currencies.
   */
  async getCombinedStats(juniorDatabase: Database): Promise<DashboardStats> {
    const [senior, junior] = await Promise.all([
      this.getGeneralStats(db),
      this.getGeneralStats(juniorDatabase),
    ]);

    const addByCurrency = (a: CurrencyAmount[], b: CurrencyAmount[]): CurrencyAmount[] => {
      const totals = new Map<string, number>();
      for (const row of [...a, ...b]) {
        totals.set(row.currency, (totals.get(row.currency) || 0) + parseFloat(row.amount || '0'));
      }
      return [...totals].map(([currency, amount]) => ({ currency, amount: amount.toFixed(2) }));
    };

    return {
      totalUsers: senior.totalUsers + junior.totalUsers,
      totalCourses: senior.totalCourses + junior.totalCourses,
      activeStudents: senior.activeStudents + junior.activeStudents,
      totalTeachers: senior.totalTeachers + junior.totalTeachers,
      activeEnrollments: senior.activeEnrollments + junior.activeEnrollments,
      pendingFees: senior.pendingFees + junior.pendingFees,
      totalFeeAmount: (parseFloat(senior.totalFeeAmount) + parseFloat(junior.totalFeeAmount)).toFixed(2),
      totalFeesByCurrency: addByCurrency(senior.totalFeesByCurrency, junior.totalFeesByCurrency),
      paidFeesThisMonth: senior.paidFeesThisMonth + junior.paidFeesThisMonth,
      paidFeesAmountThisMonth: addByCurrency(senior.paidFeesAmountThisMonth, junior.paidFeesAmountThisMonth),
      upcomingClasses: senior.upcomingClasses + junior.upcomingClasses,
      recentActivity: {
        recentEnrollments: (senior.recentActivity?.recentEnrollments || 0) + (junior.recentActivity?.recentEnrollments || 0),
        recentFees: (senior.recentActivity?.recentFees || 0) + (junior.recentActivity?.recentFees || 0),
      },
    };
  },

  /**
   * Sudo overview of one month's fees:
   *  - summary: how many students and fees there are that month, and how many are paid,
   *    pending and overdue. A student counts as overdue if any of their fees is overdue,
   *    else pending if any is pending, else paid.
   *  - teachers: for each teacher's class, the students enrolled now and where each one's
   *    fee for the month stands.
   * Dropped / on-leave fees and zero-amount placeholders are not owed, so they are left out.
   */
  async getFeeOverview(month: number, year: number, database: Database = db): Promise<FeeOverview> {
    const owed = sql`f.status IN ('received', 'pending', 'overdue') AND f.amount::numeric > 0
      AND f.month = ${month} AND f.year = ${year}`;

    const [totals] = (await database.execute(sql`
      WITH per_student AS (
        SELECT f.student_id,
               bool_or(f.status = 'overdue') AS has_overdue,
               bool_or(f.status = 'pending') AS has_pending
        FROM fees f WHERE ${owed}
        GROUP BY f.student_id
      )
      SELECT count(*)::int AS total,
             count(*) FILTER (WHERE has_overdue)::int AS overdue,
             count(*) FILTER (WHERE NOT has_overdue AND has_pending)::int AS pending,
             count(*) FILTER (WHERE NOT has_overdue AND NOT has_pending)::int AS paid
      FROM per_student`)).rows as any[];

    const byStatus = (await database.execute(sql`
      SELECT f.status, COALESCE(f.currency, 'PKR') AS currency,
             count(*)::int AS fees, COALESCE(SUM(f.amount::numeric), 0)::text AS amount
      FROM fees f WHERE ${owed}
      GROUP BY f.status, COALESCE(f.currency, 'PKR')`)).rows as any[];

    const feeCount = (status?: string) => byStatus
      .filter((row) => !status || row.status === status)
      .reduce((sum, row) => sum + row.fees, 0);
    const amounts = (status?: string): CurrencyAmount[] => {
      const perCurrency = new Map<string, number>();
      for (const row of byStatus) {
        if (!status || row.status === status) perCurrency.set(row.currency, (perCurrency.get(row.currency) || 0) + parseFloat(row.amount));
      }
      return [...perCurrency].map(([currency, amount]) => ({ currency, amount: amount.toFixed(2) }));
    };
    const group = (students: number, status?: string): FeeGroup => ({ students, fees: feeCount(status), amounts: amounts(status) });

    // One row per teacher and class: students enrolled now, and each one's fee for the month
    const classRows = (await database.execute(sql`
      SELECT ct.teacher_id AS "teacherId", u.first_name AS "firstName", u.last_name AS "lastName",
             c.id AS "courseId", c.title,
             count(e.id)::int AS enrolled,
             count(f.id) FILTER (WHERE f.status = 'received')::int AS paid,
             count(f.id) FILTER (WHERE f.status = 'pending')::int AS pending,
             count(f.id) FILTER (WHERE f.status = 'overdue')::int AS overdue
      FROM course_teachers ct
      INNER JOIN users u ON u.id = ct.teacher_id AND u.is_active = true
      INNER JOIN courses c ON c.id = ct.course_id AND c.is_active = true
      INNER JOIN enrollments e ON e.course_id = c.id AND e.status = 'active'
      LEFT JOIN fees f ON f.enrollment_id = e.id AND ${owed}
      GROUP BY ct.teacher_id, u.first_name, u.last_name, c.id, c.title
      ORDER BY u.first_name, u.last_name, c.title`)).rows as any[];

    const teachers = new Map<string, TeacherFeeOverview>();
    for (const row of classRows) {
      let teacher = teachers.get(row.teacherId);
      if (!teacher) {
        teacher = { teacherId: row.teacherId, name: `${row.firstName} ${row.lastName}`, enrolled: 0, paid: 0, pending: 0, overdue: 0, classes: [] };
        teachers.set(row.teacherId, teacher);
      }
      teacher.classes.push({ courseId: row.courseId, title: row.title, enrolled: row.enrolled, paid: row.paid, pending: row.pending, overdue: row.overdue });
      teacher.enrolled += row.enrolled;
      teacher.paid += row.paid;
      teacher.pending += row.pending;
      teacher.overdue += row.overdue;
    }

    return {
      month,
      year,
      total: group(totals?.total || 0),
      paid: group(totals?.paid || 0, 'received'),
      pending: group(totals?.pending || 0, 'pending'),
      overdue: group(totals?.overdue || 0, 'overdue'),
      teachers: [...teachers.values()],
    };
  },

  /**
   * The students behind one number of the fee overview.
   *  - With a teacher (and optionally one class): the students enrolled now in that
   *    teacher's classes, filtered by where their fee for the month stands
   *    ('enrolled' = all of them, 'nofee' = enrolled but nothing owed that month).
   *  - Without a teacher (the four boxes at the top): the month's fees of the students in
   *    that group, using the same once-per-student rule as the counts.
   * One line per student and class.
   */
  async getFeeOverviewStudents(
    filter: { month: number; year: number; status: FeeOverviewStatus; teacherId?: string; courseId?: string },
    database: Database = db,
  ): Promise<FeeOverviewStudent[]> {
    const { month, year, status } = filter;
    const owed = sql`f.status IN ('received', 'pending', 'overdue') AND f.amount::numeric > 0
      AND f.month = ${month} AND f.year = ${year}`;
    const columns = sql`
      u.id AS "studentId", u.first_name AS "firstName", u.last_name AS "lastName",
      c.id AS "courseId", c.title AS "classTitle",
      f.id AS "feeId", f.amount, COALESCE(f.currency, 'PKR') AS currency, f.status AS "feeStatus",
      to_char(f.due_date, 'YYYY-MM-DD') AS "dueDate"`; // as text, so no time-zone shift on the way out

    if (filter.teacherId) {
      const wanted = {
        enrolled: sql`true`,
        total: sql`true`,
        paid: sql`f.status = 'received'`,
        pending: sql`f.status = 'pending'`,
        overdue: sql`f.status = 'overdue'`,
        nofee: sql`f.id IS NULL`,
      }[status];
      return (await database.execute(sql`
        SELECT ${columns}
        FROM course_teachers ct
        INNER JOIN courses c ON c.id = ct.course_id AND c.is_active = true
        INNER JOIN enrollments e ON e.course_id = c.id AND e.status = 'active'
        INNER JOIN users u ON u.id = e.student_id
        LEFT JOIN fees f ON f.enrollment_id = e.id AND ${owed}
        WHERE ct.teacher_id = ${filter.teacherId}
          AND ${filter.courseId ? sql`c.id = ${filter.courseId}` : sql`true`}
          AND ${wanted}
        ORDER BY u.first_name, u.last_name, c.title`)).rows as unknown as FeeOverviewStudent[];
    }

    // The boxes at the top: a student is overdue if any fee is overdue, else pending, else paid
    const group = {
      enrolled: sql`true`,
      total: sql`true`,
      nofee: sql`false`,
      overdue: sql`s.has_overdue`,
      pending: sql`NOT s.has_overdue AND s.has_pending`,
      paid: sql`NOT s.has_overdue AND NOT s.has_pending`,
    }[status];
    return (await database.execute(sql`
      WITH per_student AS (
        SELECT f.student_id,
               bool_or(f.status = 'overdue') AS has_overdue,
               bool_or(f.status = 'pending') AS has_pending
        FROM fees f WHERE ${owed}
        GROUP BY f.student_id
      )
      SELECT ${columns}
      FROM fees f
      INNER JOIN per_student s ON s.student_id = f.student_id
      INNER JOIN users u ON u.id = f.student_id
      INNER JOIN courses c ON c.id = f.course_id
      WHERE ${owed} AND ${group}
      ORDER BY u.first_name, u.last_name, c.title`)).rows as unknown as FeeOverviewStudent[];
  },

  /**
   * Get student-specific stats
   */
  async getStudentStats(studentId: string): Promise<RoleSpecificStats> {
    // My enrollments
    const [myEnrollmentsResult] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(enrollments)
      .where(and(eq(enrollments.studentId, studentId), eq(enrollments.status, 'active')));

    const myEnrollments = myEnrollmentsResult?.count || 0;

    // My pending fees
    const [myPendingFeesResult] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(fees)
      .where(and(eq(fees.studentId, studentId), sql`${fees.status} IN ('pending', 'overdue')`, feeInBooks()));

    const myPendingFees = myPendingFeesResult?.count || 0;

    // My total due - Deprecated but kept for backward compatibility
    const [myTotalDueResult] = await db
      .select({ sum: sql<string>`COALESCE(SUM(amount::numeric), 0)` })
      .from(fees)
      .where(and(eq(fees.studentId, studentId), sql`${fees.status} IN ('pending', 'overdue')`, feeInBooks()));

    const myTotalDue = myTotalDueResult?.sum || '0';

    // My total due by currency
    const myTotalDueByCurrencyResult = await db
      .select({
        currency: sql<string>`COALESCE(${fees.currency}, 'PKR')`,
        amount: sql<string>`COALESCE(SUM(amount::numeric), 0)`,
      })
      .from(fees)
      .where(and(eq(fees.studentId, studentId), sql`${fees.status} IN ('pending', 'overdue')`, feeInBooks()))
      .groupBy(sql`COALESCE(${fees.currency}, 'PKR')`);

    const myTotalDueByCurrency: CurrencyAmount[] = myTotalDueByCurrencyResult.map(row => ({
      currency: row.currency,
      amount: row.amount,
    }));

    // Upcoming classes (next 7 days) - students enrolled in courses
    const today = new Date();
    const nextWeek = new Date();
    nextWeek.setDate(nextWeek.getDate() + 7);

    const [upcomingClassesResult] = await db
      .select({ count: sql<number>`count(DISTINCT ${courseEvents.id})::int` })
      .from(courseEvents)
      .innerJoin(enrollments, eq(courseEvents.courseId, enrollments.courseId))
      .where(
        and(
          eq(enrollments.studentId, studentId),
          eq(enrollments.status, 'active'),
          eq(courseEvents.status, 'scheduled'),
          gte(courseEvents.eventDate, formatDate(today)),
          sql`${courseEvents.eventDate} <= ${formatDate(nextWeek)}`
        )
      );

    const upcomingClasses = upcomingClassesResult?.count || 0;

    // Projected monthly fees from active 1-to-1 enrollments
    const projected1to1Rows = await db
      .select({
        currency: enrollments.currency,
        projectedAmount: sql<string>`COALESCE(SUM(${enrollments.perSessionFee}::numeric * ${enrollments.expectedClassesPerMonth}), 0)`,
      })
      .from(enrollments)
      .where(
        and(
          eq(enrollments.studentId, studentId),
          eq(enrollments.status, 'active'),
          eq(enrollments.classType, '1-to-1'),
          sql`${enrollments.expectedClassesPerMonth} IS NOT NULL`,
          sql`${enrollments.perSessionFee} IS NOT NULL`
        )
      )
      .groupBy(enrollments.currency);

    const projected1to1Fees: CurrencyAmount[] = projected1to1Rows
      .filter(row => parseFloat(row.projectedAmount) > 0)
      .map(row => ({ currency: row.currency, amount: row.projectedAmount }));

    return {
      student: {
        myEnrollments,
        myPendingFees,
        myTotalDue,
        myTotalDueByCurrency,
        upcomingClasses,
        projected1to1Fees,
      },
    };
  },

  /**
   * Get teacher-specific stats
   */
  async getTeacherStats(teacherId: string): Promise<RoleSpecificStats> {
    // My courses (through courseTeachers table)
    const myCoursesResult = await db.execute(
      sql`SELECT COUNT(DISTINCT ct.course_id)::int as count
        FROM course_teachers ct
        INNER JOIN courses c ON ct.course_id = c.id
        WHERE ct.teacher_id = ${teacherId} AND c.is_active = true`
    );

    const myCourses = (myCoursesResult.rows[0] as any)?.count || 0;

    // My students (enrolled in my courses)
    const myStudentsResult = await db.execute(
      sql`SELECT COUNT(DISTINCT e.student_id)::int as count
        FROM course_teachers ct
        INNER JOIN enrollments e ON ct.course_id = e.course_id
        WHERE ct.teacher_id = ${teacherId} AND e.status = 'active'`
    );

    const myStudents = (myStudentsResult.rows[0] as any)?.count || 0;

    // Upcoming classes (next 7 days) where I'm the teacher
    const today = new Date();
    const nextWeek = new Date();
    nextWeek.setDate(nextWeek.getDate() + 7);

    const [upcomingClassesResult] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(courseEvents)
      .where(
        and(
          eq(courseEvents.teacherId, teacherId),
          eq(courseEvents.status, 'scheduled'),
          gte(courseEvents.eventDate, formatDate(today)),
          sql`${courseEvents.eventDate} <= ${formatDate(nextWeek)}`
        )
      );

    const upcomingClasses = upcomingClassesResult?.count || 0;

    return {
      teacher: {
        myCourses,
        myStudents,
        upcomingClasses,
      },
    };
  },
};

export default dashboardService;

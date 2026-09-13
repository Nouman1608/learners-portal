import { db } from '../config/database';
import { users } from '../db/schema/users';
import { courses, courseEvents } from '../db/schema/courses';
import { enrollments, fees } from '../db/schema/enrollments';
import { eq, and, gte, sql } from 'drizzle-orm';
import { format } from 'date-fns';

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
  async getGeneralStats(): Promise<DashboardStats> {
    // Total users
    const [totalUsersResult] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(users)
      .where(eq(users.isActive, true));

    const totalUsers = totalUsersResult?.count || 0;

    // Total courses
    const [totalCoursesResult] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(courses)
      .where(eq(courses.isActive, true));

    const totalCourses = totalCoursesResult?.count || 0;

    // Active students
    const [activeStudentsResult] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(users)
      .where(and(eq(users.role, 'student'), eq(users.isActive, true)));

    const activeStudents = activeStudentsResult?.count || 0;

    // Total teachers
    const [totalTeachersResult] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(users)
      .where(and(eq(users.role, 'teacher'), eq(users.isActive, true)));

    const totalTeachers = totalTeachersResult?.count || 0;

    // Active enrollments
    const [activeEnrollmentsResult] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(enrollments)
      .where(eq(enrollments.status, 'active'));

    const activeEnrollments = activeEnrollmentsResult?.count || 0;

    // Pending fees
    const [pendingFeesResult] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(fees)
      .where(eq(fees.status, 'pending'));

    const pendingFees = pendingFeesResult?.count || 0;

    // Total fee amount (pending + overdue) - Deprecated but kept for backward compatibility
    const [totalFeeAmountResult] = await db
      .select({ sum: sql<string>`COALESCE(SUM(amount::numeric), 0)` })
      .from(fees)
      .where(sql`${fees.status} IN ('pending', 'overdue')`);

    const totalFeeAmount = totalFeeAmountResult?.sum || '0';

    // Total fees by currency (pending + overdue)
    const totalFeesByCurrencyResult = await db
      .select({
        currency: sql<string>`COALESCE(${fees.currency}, 'PKR')`,
        amount: sql<string>`COALESCE(SUM(amount::numeric), 0)`,
      })
      .from(fees)
      .where(sql`${fees.status} IN ('pending', 'overdue')`)
      .groupBy(sql`COALESCE(${fees.currency}, 'PKR')`);

    const totalFeesByCurrency: CurrencyAmount[] = totalFeesByCurrencyResult.map(row => ({
      currency: row.currency,
      amount: row.amount,
    }));

    // Paid fees this month (status = 'received', current month/year)
    const currentMonth = new Date().getMonth() + 1; // 1-12
    const currentYear = new Date().getFullYear();

    const [paidFeesCountResult] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(fees)
      .where(and(
        eq(fees.status, 'received'),
        eq(fees.month, currentMonth),
        eq(fees.year, currentYear)
      ));

    const paidFeesThisMonth = paidFeesCountResult?.count || 0;

    const paidFeesAmountResult = await db
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

    const [upcomingClassesResult] = await db
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

    const [recentEnrollmentsResult] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(enrollments)
      .where(gte(enrollments.enrolledAt, lastWeek));

    const recentEnrollments = recentEnrollmentsResult?.count || 0;

    const [recentFeesResult] = await db
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
      .where(and(eq(fees.studentId, studentId), sql`${fees.status} IN ('pending', 'overdue')`));

    const myPendingFees = myPendingFeesResult?.count || 0;

    // My total due - Deprecated but kept for backward compatibility
    const [myTotalDueResult] = await db
      .select({ sum: sql<string>`COALESCE(SUM(amount::numeric), 0)` })
      .from(fees)
      .where(and(eq(fees.studentId, studentId), sql`${fees.status} IN ('pending', 'overdue')`));

    const myTotalDue = myTotalDueResult?.sum || '0';

    // My total due by currency
    const myTotalDueByCurrencyResult = await db
      .select({
        currency: sql<string>`COALESCE(${fees.currency}, 'PKR')`,
        amount: sql<string>`COALESCE(SUM(amount::numeric), 0)`,
      })
      .from(fees)
      .where(and(eq(fees.studentId, studentId), sql`${fees.status} IN ('pending', 'overdue')`))
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

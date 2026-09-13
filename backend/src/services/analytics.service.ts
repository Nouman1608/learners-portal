import { db } from '../config/database';
import { users } from '../db/schema/users';
import { courses, courseEvents } from '../db/schema/courses';
import { enrollments, fees } from '../db/schema/enrollments';
import { assessments, assessmentResults } from '../db/schema/assessments';
import { attendanceRecords } from '../db/schema/attendance';
import { payments } from '../db/schema/enrollments';
import { eq, and, gte, lte, sql, desc, between } from 'drizzle-orm';
import { AppError } from '../middleware/errorHandler';
import logger from '../utils/logger';

/**
 * Analytics Service
 * Provides comprehensive analytics across all system domains
 */
export const analyticsService = {
  /**
   * FINANCIAL ANALYTICS
   */

  /**
   * Get revenue over time grouped by period
   */
  async getRevenueOverTime(
    startDate: Date,
    endDate: Date,
    groupBy: 'day' | 'week' | 'month' = 'month'
  ) {
    try {
      let dateFormat: string;
      switch (groupBy) {
        case 'day':
          dateFormat = 'YYYY-MM-DD';
          break;
        case 'week':
          dateFormat = 'YYYY-"W"IW';
          break;
        case 'month':
        default:
          dateFormat = 'YYYY-MM';
      }

      const revenue = await db
        .select({
          period: sql<string>`TO_CHAR(${payments.paymentDate}, ${dateFormat})`,
          revenue: sql<number>`COALESCE(SUM(${payments.amount}::numeric), 0)::float`,
          count: sql<number>`COUNT(*)::int`,
        })
        .from(payments)
        .where(
          and(
            gte(payments.paymentDate, startDate),
            lte(payments.paymentDate, endDate)
          )
        )
        .groupBy(sql`TO_CHAR(${payments.paymentDate}, ${dateFormat})`)
        .orderBy(sql`TO_CHAR(${payments.paymentDate}, ${dateFormat})`);

      return revenue.map(r => ({
        date: r.period,
        revenue: r.revenue,
        transactionCount: r.count,
      }));
    } catch (error: any) {
      logger.error('Error getting revenue over time', { error: error.message });
      throw new AppError(500, 'Failed to fetch revenue analytics');
    }
  },

  /**
   * Get payment method breakdown
   */
  async getPaymentMethodBreakdown(startDate: Date, endDate: Date) {
    try {
      const breakdown = await db
        .select({
          method: payments.paymentMethod,
          count: sql<number>`COUNT(*)::int`,
          amount: sql<number>`COALESCE(SUM(${payments.amount}::numeric), 0)::float`,
        })
        .from(payments)
        .where(
          and(
            gte(payments.paymentDate, startDate),
            lte(payments.paymentDate, endDate)
          )
        )
        .groupBy(payments.paymentMethod);

      return breakdown;
    } catch (error: any) {
      logger.error('Error getting payment method breakdown', { error: error.message });
      throw new AppError(500, 'Failed to fetch payment method analytics');
    }
  },

  /**
   * Get outstanding fees analysis (aging)
   */
  async getOutstandingFeesAnalysis() {
    try {
      const now = new Date();

      const aging = await db
        .select({
          range: sql<string>`
            CASE
              WHEN ${fees.dueDate} >= ${now} THEN 'current'
              WHEN ${fees.dueDate} >= ${now}::date - INTERVAL '30 days' THEN '0-30 days overdue'
              WHEN ${fees.dueDate} >= ${now}::date - INTERVAL '60 days' THEN '31-60 days overdue'
              WHEN ${fees.dueDate} >= ${now}::date - INTERVAL '90 days' THEN '61-90 days overdue'
              ELSE '90+ days overdue'
            END
          `,
          count: sql<number>`COUNT(*)::int`,
          amount: sql<number>`COALESCE(SUM(${fees.amount}::numeric), 0)::float`,
        })
        .from(fees)
        .where(sql`${fees.status} IN ('pending', 'overdue')`)
        .groupBy(sql`
          CASE
            WHEN ${fees.dueDate} >= ${now} THEN 'current'
            WHEN ${fees.dueDate} >= ${now}::date - INTERVAL '30 days' THEN '0-30 days overdue'
            WHEN ${fees.dueDate} >= ${now}::date - INTERVAL '60 days' THEN '31-60 days overdue'
            WHEN ${fees.dueDate} >= ${now}::date - INTERVAL '90 days' THEN '61-90 days overdue'
            ELSE '90+ days overdue'
          END
        `);

      return aging;
    } catch (error: any) {
      logger.error('Error getting outstanding fees analysis', { error: error.message });
      throw new AppError(500, 'Failed to fetch outstanding fees analytics');
    }
  },

  /**
   * Get revenue breakdown by course
   */
  async getCourseRevenueBreakdown(startDate: Date, endDate: Date) {
    try {
      const courseRevenue = await db
        .select({
          courseId: fees.courseId,
          courseTitle: courses.title,
          revenue: sql<number>`COALESCE(SUM(${payments.amount}::numeric), 0)::float`,
          studentCount: sql<number>`COUNT(DISTINCT ${fees.studentId})::int`,
        })
        .from(payments)
        .innerJoin(fees, eq(payments.feeId, fees.id))
        .innerJoin(courses, eq(fees.courseId, courses.id))
        .where(
          and(
            gte(payments.paymentDate, startDate),
            lte(payments.paymentDate, endDate)
          )
        )
        .groupBy(fees.courseId, courses.title)
        .orderBy(desc(sql`COALESCE(SUM(${payments.amount}::numeric), 0)`));

      return courseRevenue;
    } catch (error: any) {
      logger.error('Error getting course revenue breakdown', { error: error.message });
      throw new AppError(500, 'Failed to fetch course revenue analytics');
    }
  },

  /**
   * PERFORMANCE ANALYTICS
   */

  /**
   * Get assessment score distribution
   */
  async getAssessmentDistributions(courseId?: string, assessmentId?: string) {
    try {
      let query = db
        .select({
          scoreRange: sql<string>`
            CASE
              WHEN (${assessmentResults.score}::numeric / ${assessments.maxScore}::numeric * 100) >= 90 THEN 'A (90-100%)'
              WHEN (${assessmentResults.score}::numeric / ${assessments.maxScore}::numeric * 100) >= 80 THEN 'B (80-89%)'
              WHEN (${assessmentResults.score}::numeric / ${assessments.maxScore}::numeric * 100) >= 70 THEN 'C (70-79%)'
              WHEN (${assessmentResults.score}::numeric / ${assessments.maxScore}::numeric * 100) >= 60 THEN 'D (60-69%)'
              ELSE 'F (0-59%)'
            END
          `,
          count: sql<number>`COUNT(*)::int`,
          avgScore: sql<number>`AVG((${assessmentResults.score}::numeric / ${assessments.maxScore}::numeric * 100))::float`,
        })
        .from(assessmentResults)
        .innerJoin(assessments, eq(assessmentResults.assessmentId, assessments.id))
        .$dynamic();

      if (courseId) {
        query = query.where(eq(assessments.courseId, courseId));
      }

      if (assessmentId) {
        query = query.where(eq(assessmentResults.assessmentId, assessmentId));
      }

      const distribution = await query
        .groupBy(sql`
          CASE
            WHEN (${assessmentResults.score}::numeric / ${assessments.maxScore}::numeric * 100) >= 90 THEN 'A (90-100%)'
            WHEN (${assessmentResults.score}::numeric / ${assessments.maxScore}::numeric * 100) >= 80 THEN 'B (80-89%)'
            WHEN (${assessmentResults.score}::numeric / ${assessments.maxScore}::numeric * 100) >= 70 THEN 'C (70-79%)'
            WHEN (${assessmentResults.score}::numeric / ${assessments.maxScore}::numeric * 100) >= 60 THEN 'D (60-69%)'
            ELSE 'F (0-59%)'
          END
        `)
        .orderBy(desc(sql`AVG((${assessmentResults.score}::numeric / ${assessments.maxScore}::numeric * 100))`));

      return distribution;
    } catch (error: any) {
      logger.error('Error getting assessment distributions', { error: error.message });
      throw new AppError(500, 'Failed to fetch performance analytics');
    }
  },

  /**
   * Get student performance trends
   */
  async getStudentPerformanceTrends(studentId: string) {
    try {
      const trends = await db
        .select({
          assessmentId: assessmentResults.assessmentId,
          assessmentTitle: assessments.title,
          courseTitle: courses.title,
          scorePercentage: sql<number>`(${assessmentResults.score}::numeric / ${assessments.maxScore}::numeric * 100)::float`,
          submittedAt: assessmentResults.submittedAt,
        })
        .from(assessmentResults)
        .innerJoin(assessments, eq(assessmentResults.assessmentId, assessments.id))
        .innerJoin(courses, eq(assessments.courseId, courses.id))
        .where(eq(assessmentResults.studentId, studentId))
        .orderBy(assessmentResults.submittedAt);

      return trends;
    } catch (error: any) {
      logger.error('Error getting student performance trends', { error: error.message });
      throw new AppError(500, 'Failed to fetch student performance analytics');
    }
  },

  /**
   * Get course performance comparison
   */
  async getCoursePerformanceComparison() {
    try {
      const comparison = await db
        .select({
          courseId: courses.id,
          courseTitle: courses.title,
          avgScore: sql<number>`AVG((${assessmentResults.score}::numeric / ${assessments.maxScore}::numeric * 100))::float`,
          studentCount: sql<number>`COUNT(DISTINCT ${assessmentResults.studentId})::int`,
          assessmentCount: sql<number>`COUNT(DISTINCT ${assessmentResults.assessmentId})::int`,
        })
        .from(courses)
        .leftJoin(assessments, eq(courses.id, assessments.courseId))
        .leftJoin(assessmentResults, eq(assessments.id, assessmentResults.assessmentId))
        .groupBy(courses.id, courses.title)
        .orderBy(desc(sql`AVG((${assessmentResults.score}::numeric / ${assessments.maxScore}::numeric * 100))`));

      return comparison;
    } catch (error: any) {
      logger.error('Error getting course performance comparison', { error: error.message });
      throw new AppError(500, 'Failed to fetch course performance analytics');
    }
  },

  /**
   * Get top performers
   */
  async getTopPerformers(courseId?: string, limit: number = 10) {
    try {
      let query = db
        .select({
          studentId: users.id,
          firstName: users.firstName,
          lastName: users.lastName,
          email: users.email,
          avgScore: sql<number>`AVG((${assessmentResults.score}::numeric / ${assessments.maxScore}::numeric * 100))::float`,
          assessmentCount: sql<number>`COUNT(${assessmentResults.id})::int`,
        })
        .from(users)
        .innerJoin(assessmentResults, eq(users.id, assessmentResults.studentId))
        .innerJoin(assessments, eq(assessmentResults.assessmentId, assessments.id))
        .$dynamic();

      if (courseId) {
        query = query.where(eq(assessments.courseId, courseId));
      }

      const topPerformers = await query
        .groupBy(users.id, users.firstName, users.lastName, users.email)
        .orderBy(desc(sql`AVG((${assessmentResults.score}::numeric / ${assessments.maxScore}::numeric * 100))`))
        .limit(limit);

      return topPerformers;
    } catch (error: any) {
      logger.error('Error getting top performers', { error: error.message });
      throw new AppError(500, 'Failed to fetch top performers');
    }
  },

  /**
   * Get pass/fail rates
   */
  async getPassFailRates(courseId?: string) {
    try {
      let query = db
        .select({
          totalAssessments: sql<number>`COUNT(*)::int`,
          passedCount: sql<number>`SUM(CASE WHEN (${assessmentResults.score}::numeric / ${assessments.maxScore}::numeric * 100) >= 60 THEN 1 ELSE 0 END)::int`,
          failedCount: sql<number>`SUM(CASE WHEN (${assessmentResults.score}::numeric / ${assessments.maxScore}::numeric * 100) < 60 THEN 1 ELSE 0 END)::int`,
          passRate: sql<number>`(SUM(CASE WHEN (${assessmentResults.score}::numeric / ${assessments.maxScore}::numeric * 100) >= 60 THEN 1 ELSE 0 END)::float / COUNT(*)::float * 100)::float`,
        })
        .from(assessmentResults)
        .innerJoin(assessments, eq(assessmentResults.assessmentId, assessments.id))
        .$dynamic();

      if (courseId) {
        query = query.where(eq(assessments.courseId, courseId));
      }

      const [rates] = await query;

      return rates || {
        totalAssessments: 0,
        passedCount: 0,
        failedCount: 0,
        passRate: 0,
      };
    } catch (error: any) {
      logger.error('Error getting pass/fail rates', { error: error.message });
      throw new AppError(500, 'Failed to fetch pass/fail rates');
    }
  },

  /**
   * ATTENDANCE ANALYTICS
   */

  /**
   * Get attendance trends over time
   */
  async getAttendanceTrends(
    courseId?: string,
    startDate?: Date,
    endDate?: Date
  ) {
    try {
      let query = db
        .select({
          eventDate: courseEvents.eventDate,
          totalStudents: sql<number>`COUNT(DISTINCT ${attendanceRecords.studentId})::int`,
          presentCount: sql<number>`SUM(CASE WHEN ${attendanceRecords.status} = 'present' THEN 1 ELSE 0 END)::int`,
          lateCount: sql<number>`SUM(CASE WHEN ${attendanceRecords.status} = 'late' THEN 1 ELSE 0 END)::int`,
          absentCount: sql<number>`SUM(CASE WHEN ${attendanceRecords.status} = 'absent' THEN 1 ELSE 0 END)::int`,
          attendanceRate: sql<number>`(SUM(CASE WHEN ${attendanceRecords.status} IN ('present', 'late') THEN 1 ELSE 0 END)::float / COUNT(*)::float * 100)::float`,
        })
        .from(attendanceRecords)
        .innerJoin(courseEvents, eq(attendanceRecords.courseEventId, courseEvents.id))
        .$dynamic();

      if (courseId) {
        query = query.where(eq(courseEvents.courseId, courseId));
      }

      if (startDate && endDate) {
        query = query.where(
          and(
            gte(courseEvents.eventDate, startDate.toISOString().split('T')[0]),
            lte(courseEvents.eventDate, endDate.toISOString().split('T')[0])
          )
        );
      }

      const trends = await query
        .groupBy(courseEvents.eventDate)
        .orderBy(courseEvents.eventDate);

      return trends;
    } catch (error: any) {
      logger.error('Error getting attendance trends', { error: error.message });
      throw new AppError(500, 'Failed to fetch attendance trends');
    }
  },

  /**
   * Get attendance by status breakdown
   */
  async getAttendanceByStatus(courseId?: string) {
    try {
      let query = db
        .select({
          status: attendanceRecords.status,
          count: sql<number>`COUNT(*)::int`,
          percentage: sql<number>`(COUNT(*)::float / SUM(COUNT(*)) OVER () * 100)::float`,
        })
        .from(attendanceRecords)
        .innerJoin(courseEvents, eq(attendanceRecords.courseEventId, courseEvents.id))
        .$dynamic();

      if (courseId) {
        query = query.where(eq(courseEvents.courseId, courseId));
      }

      const breakdown = await query.groupBy(attendanceRecords.status);

      return breakdown;
    } catch (error: any) {
      logger.error('Error getting attendance by status', { error: error.message });
      throw new AppError(500, 'Failed to fetch attendance status breakdown');
    }
  },

  /**
   * COURSE & TEACHER ANALYTICS
   */

  /**
   * Get course popularity (enrollment counts)
   */
  async getCoursePopularity() {
    try {
      const popularity = await db
        .select({
          courseId: courses.id,
          courseTitle: courses.title,
          activeEnrollments: sql<number>`COUNT(CASE WHEN ${enrollments.status} = 'active' THEN 1 END)::int`,
          totalEnrollments: sql<number>`COUNT(${enrollments.id})::int`,
          completedEnrollments: sql<number>`COUNT(CASE WHEN ${enrollments.status} = 'completed' THEN 1 END)::int`,
        })
        .from(courses)
        .leftJoin(enrollments, eq(courses.id, enrollments.courseId))
        .groupBy(courses.id, courses.title)
        .orderBy(desc(sql`COUNT(CASE WHEN ${enrollments.status} = 'active' THEN 1 END)`));

      return popularity;
    } catch (error: any) {
      logger.error('Error getting course popularity', { error: error.message });
      throw new AppError(500, 'Failed to fetch course popularity analytics');
    }
  },

  /**
   * Get enrollment trends over time
   */
  async getEnrollmentTrends(startDate: Date, endDate: Date) {
    try {
      const trends = await db
        .select({
          month: sql<string>`TO_CHAR(${enrollments.enrolledAt}, 'YYYY-MM')`,
          enrollmentCount: sql<number>`COUNT(*)::int`,
        })
        .from(enrollments)
        .where(
          and(
            gte(enrollments.enrolledAt, startDate),
            lte(enrollments.enrolledAt, endDate)
          )
        )
        .groupBy(sql`TO_CHAR(${enrollments.enrolledAt}, 'YYYY-MM')`)
        .orderBy(sql`TO_CHAR(${enrollments.enrolledAt}, 'YYYY-MM')`);

      return trends;
    } catch (error: any) {
      logger.error('Error getting enrollment trends', { error: error.message });
      throw new AppError(500, 'Failed to fetch enrollment trends');
    }
  },

  /**
   * Get teacher workload
   */
  async getTeacherWorkload() {
    try {
      const workload = await db
        .select({
          teacherId: users.id,
          teacherName: sql<string>`CONCAT(${users.firstName}, ' ', ${users.lastName})`,
          courseCount: sql<number>`COUNT(DISTINCT ${courseEvents.courseId})::int`,
          totalClasses: sql<number>`COUNT(${courseEvents.id})::int`,
          studentCount: sql<number>`COUNT(DISTINCT ${enrollments.studentId})::int`,
        })
        .from(users)
        .leftJoin(courseEvents, eq(users.id, courseEvents.teacherId))
        .leftJoin(enrollments, eq(courseEvents.courseId, enrollments.courseId))
        .where(eq(users.role, 'teacher'))
        .groupBy(users.id, users.firstName, users.lastName)
        .orderBy(desc(sql`COUNT(${courseEvents.id})`));

      return workload;
    } catch (error: any) {
      logger.error('Error getting teacher workload', { error: error.message });
      throw new AppError(500, 'Failed to fetch teacher workload analytics');
    }
  },
};

export default analyticsService;

import { db } from '../config/database';
import { users } from '../db/schema/users';
import { courses, courseEvents } from '../db/schema/courses';
import { enrollments, fees } from '../db/schema/enrollments';
import { assessments, assessmentResults } from '../db/schema/assessments';
import { attendanceRecords } from '../db/schema/attendance';
import { payments } from '../db/schema/enrollments';
import { invoices, invoiceLineItems } from '../db/schema/invoices';
import { leads } from '../db/schema/leads';
import { eq, and, gte, lte, sql, desc, SQL } from 'drizzle-orm';
import { AppError } from '../middleware/errorHandler';
import { currencyService, CurrencyCode } from './currency.service';
import logger from '../utils/logger';

/**
 * Analytics Service
 * Provides comprehensive analytics across all system domains
 */

/**
 * SQL CASE mapping a currency column to its PKR rate. Built from
 * currency.service so the rates have a single source of truth.
 */
function pkrRateExpr(currencyCol: any): SQL {
  const whens = currencyService
    .getSupportedCurrencies()
    .map(r => sql`WHEN ${r.code} THEN ${r.rateToPKR}`);
  return sql`(CASE ${currencyCol} ${sql.join(whens, sql` `)} ELSE 1 END)`;
}

/** Sums an amount column converted to PKR. */
function sumInPkr(amountCol: any, currencyCol: any): SQL<number> {
  return sql<number>`COALESCE(SUM(${amountCol}::numeric * ${pkrRateExpr(currencyCol)}), 0)::float`;
}

export const analyticsService = {
  /**
   * FINANCIAL ANALYTICS
   */

  /**
   * Revenue over time, split by the currency the student actually paid in.
   * Payments carry no currency of their own, so it comes from the parent fee.
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

      const rows = await db
        .select({
          period: sql<string>`TO_CHAR(${payments.paymentDate}, ${dateFormat})`,
          currency: fees.currency,
          revenue: sql<number>`COALESCE(SUM(${payments.amount}::numeric), 0)::float`,
          revenuePKR: sumInPkr(payments.amount, fees.currency),
          count: sql<number>`COUNT(*)::int`,
        })
        .from(payments)
        .innerJoin(fees, eq(payments.feeId, fees.id))
        .where(
          and(
            gte(payments.paymentDate, startDate),
            lte(payments.paymentDate, endDate)
          )
        )
        .groupBy(sql`TO_CHAR(${payments.paymentDate}, ${dateFormat})`, fees.currency)
        .orderBy(sql`TO_CHAR(${payments.paymentDate}, ${dateFormat})`);

      // Collapse (period, currency) rows into one entry per period.
      const periods = new Map<string, {
        date: string;
        byCurrency: { currency: string; revenue: number; revenuePKR: number; transactionCount: number }[];
        revenuePKR: number;
        transactionCount: number;
      }>();

      for (const row of rows) {
        const entry = periods.get(row.period) ?? {
          date: row.period,
          byCurrency: [],
          revenuePKR: 0,
          transactionCount: 0,
        };
        entry.byCurrency.push({
          currency: row.currency,
          revenue: row.revenue,
          revenuePKR: row.revenuePKR,
          transactionCount: row.count,
        });
        entry.revenuePKR += row.revenuePKR;
        entry.transactionCount += row.count;
        periods.set(row.period, entry);
      }

      return Array.from(periods.values());
    } catch (error: any) {
      logger.error('Error getting revenue over time', { error: error.message });
      throw new AppError(500, 'Failed to fetch revenue analytics');
    }
  },

  /**
   * Payment method breakdown, split by currency.
   */
  async getPaymentMethodBreakdown(startDate: Date, endDate: Date) {
    try {
      const rows = await db
        .select({
          method: payments.paymentMethod,
          currency: fees.currency,
          count: sql<number>`COUNT(*)::int`,
          amount: sql<number>`COALESCE(SUM(${payments.amount}::numeric), 0)::float`,
          amountPKR: sumInPkr(payments.amount, fees.currency),
        })
        .from(payments)
        .innerJoin(fees, eq(payments.feeId, fees.id))
        .where(
          and(
            gte(payments.paymentDate, startDate),
            lte(payments.paymentDate, endDate)
          )
        )
        .groupBy(payments.paymentMethod, fees.currency);

      const methods = new Map<string, {
        method: string;
        byCurrency: { currency: string; amount: number; amountPKR: number; count: number }[];
        amountPKR: number;
        count: number;
      }>();

      for (const row of rows) {
        const entry = methods.get(row.method) ?? {
          method: row.method,
          byCurrency: [],
          amountPKR: 0,
          count: 0,
        };
        entry.byCurrency.push({
          currency: row.currency,
          amount: row.amount,
          amountPKR: row.amountPKR,
          count: row.count,
        });
        entry.amountPKR += row.amountPKR;
        entry.count += row.count;
        methods.set(row.method, entry);
      }

      return Array.from(methods.values()).sort((a, b) => b.amountPKR - a.amountPKR);
    } catch (error: any) {
      logger.error('Error getting payment method breakdown', { error: error.message });
      throw new AppError(500, 'Failed to fetch payment method analytics');
    }
  },

  /**
   * Outstanding fees by age bucket, split by currency.
   */
  async getOutstandingFeesAnalysis() {
    try {
      const bucket = sql`
        CASE
          WHEN ${fees.dueDate} >= CURRENT_DATE THEN 'current'
          WHEN ${fees.dueDate} >= CURRENT_DATE - INTERVAL '30 days' THEN '0-30 days overdue'
          WHEN ${fees.dueDate} >= CURRENT_DATE - INTERVAL '60 days' THEN '31-60 days overdue'
          WHEN ${fees.dueDate} >= CURRENT_DATE - INTERVAL '90 days' THEN '61-90 days overdue'
          ELSE '90+ days overdue'
        END
      `;

      const rows = await db
        .select({
          range: sql<string>`${bucket}`,
          currency: fees.currency,
          count: sql<number>`COUNT(*)::int`,
          amount: sql<number>`COALESCE(SUM(${fees.amount}::numeric), 0)::float`,
          amountPKR: sumInPkr(fees.amount, fees.currency),
        })
        .from(fees)
        .where(sql`${fees.status} IN ('pending', 'overdue')`)
        .groupBy(bucket, fees.currency);

      const buckets = new Map<string, {
        range: string;
        byCurrency: { currency: string; amount: number; amountPKR: number; count: number }[];
        amountPKR: number;
        count: number;
      }>();

      for (const row of rows) {
        const entry = buckets.get(row.range) ?? {
          range: row.range,
          byCurrency: [],
          amountPKR: 0,
          count: 0,
        };
        entry.byCurrency.push({
          currency: row.currency,
          amount: row.amount,
          amountPKR: row.amountPKR,
          count: row.count,
        });
        entry.amountPKR += row.amountPKR;
        entry.count += row.count;
        buckets.set(row.range, entry);
      }

      return Array.from(buckets.values());
    } catch (error: any) {
      logger.error('Error getting outstanding fees analysis', { error: error.message });
      throw new AppError(500, 'Failed to fetch outstanding fees analytics');
    }
  },

  /**
   * Revenue per course, split by currency and ordered by PKR value.
   */
  async getCourseRevenueBreakdown(startDate: Date, endDate: Date) {
    try {
      const rows = await db
        .select({
          courseId: fees.courseId,
          courseTitle: courses.title,
          currency: fees.currency,
          revenue: sql<number>`COALESCE(SUM(${payments.amount}::numeric), 0)::float`,
          revenuePKR: sumInPkr(payments.amount, fees.currency),
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
        .groupBy(fees.courseId, courses.title, fees.currency);

      const byCourse = new Map<string, {
        courseId: string;
        courseTitle: string;
        byCurrency: { currency: string; revenue: number; revenuePKR: number }[];
        revenuePKR: number;
        studentCount: number;
      }>();

      for (const row of rows) {
        const entry = byCourse.get(row.courseId) ?? {
          courseId: row.courseId,
          courseTitle: row.courseTitle,
          byCurrency: [],
          revenuePKR: 0,
          studentCount: 0,
        };
        entry.byCurrency.push({
          currency: row.currency,
          revenue: row.revenue,
          revenuePKR: row.revenuePKR,
        });
        entry.revenuePKR += row.revenuePKR;
        entry.studentCount += row.studentCount;
        byCourse.set(row.courseId, entry);
      }

      return Array.from(byCourse.values()).sort((a, b) => b.revenuePKR - a.revenuePKR);
    } catch (error: any) {
      logger.error('Error getting course revenue breakdown', { error: error.message });
      throw new AppError(500, 'Failed to fetch course revenue analytics');
    }
  },

  /**
   * Collection rate: of everything billed in the period, how much was paid.
   * Billed and collected both come from fees so the comparison is like for like.
   */
  async getCollectionRate(startDate: Date, endDate: Date) {
    try {
      const rows = await db
        .select({
          currency: fees.currency,
          billed: sql<number>`COALESCE(SUM(${fees.amount}::numeric), 0)::float`,
          billedPKR: sumInPkr(fees.amount, fees.currency),
          collected: sql<number>`COALESCE(SUM(CASE WHEN ${fees.status} = 'received' THEN ${fees.amount}::numeric ELSE 0 END), 0)::float`,
          collectedPKR: sql<number>`COALESCE(SUM(CASE WHEN ${fees.status} = 'received' THEN ${fees.amount}::numeric * ${pkrRateExpr(fees.currency)} ELSE 0 END), 0)::float`,
          feeCount: sql<number>`COUNT(*)::int`,
          paidCount: sql<number>`SUM(CASE WHEN ${fees.status} = 'received' THEN 1 ELSE 0 END)::int`,
        })
        .from(fees)
        .where(
          and(
            gte(fees.dueDate, startDate.toISOString().split('T')[0]),
            lte(fees.dueDate, endDate.toISOString().split('T')[0])
          )
        )
        .groupBy(fees.currency);

      const byCurrency = rows.map(r => ({
        currency: r.currency,
        billed: r.billed,
        collected: r.collected,
        outstanding: r.billed - r.collected,
        billedPKR: r.billedPKR,
        collectedPKR: r.collectedPKR,
        collectionRate: r.billed > 0 ? (r.collected / r.billed) * 100 : 0,
        feeCount: r.feeCount,
        paidCount: r.paidCount,
      }));

      const billedPKR = byCurrency.reduce((s, r) => s + r.billedPKR, 0);
      const collectedPKR = byCurrency.reduce((s, r) => s + r.collectedPKR, 0);

      return {
        byCurrency,
        billedPKR,
        collectedPKR,
        outstandingPKR: billedPKR - collectedPKR,
        collectionRate: billedPKR > 0 ? (collectedPKR / billedPKR) * 100 : 0,
        feeCount: byCurrency.reduce((s, r) => s + r.feeCount, 0),
        paidCount: byCurrency.reduce((s, r) => s + r.paidCount, 0),
      };
    } catch (error: any) {
      logger.error('Error getting collection rate', { error: error.message });
      throw new AppError(500, 'Failed to fetch collection rate');
    }
  },

  /**
   * Course profitability: revenue collected minus what teachers were invoiced
   * for that course. Normalised to PKR so courses billed in different
   * currencies can be compared.
   */
  async getCourseProfitability(startDate: Date, endDate: Date) {
    try {
      const revenueRows = await db
        .select({
          courseId: fees.courseId,
          courseTitle: courses.title,
          revenuePKR: sumInPkr(payments.amount, fees.currency),
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
        .groupBy(fees.courseId, courses.title);

      // Only the latest version of each teacher invoice, otherwise regenerated
      // invoices would be counted more than once.
      const costRows = await db
        .select({
          courseId: invoiceLineItems.courseId,
          costPKR: sql<number>`COALESCE(SUM(${invoiceLineItems.amount}::numeric * ${pkrRateExpr(invoices.currency)}), 0)::float`,
        })
        .from(invoiceLineItems)
        .innerJoin(invoices, eq(invoiceLineItems.invoiceId, invoices.id))
        .where(
          and(
            eq(invoices.type, 'teacher'),
            eq(invoices.isLatest, true),
            gte(sql`MAKE_DATE(${invoices.year}, ${invoices.month}, 1)`, sql`${startDate.toISOString().split('T')[0]}::date`),
            lte(sql`MAKE_DATE(${invoices.year}, ${invoices.month}, 1)`, sql`${endDate.toISOString().split('T')[0]}::date`)
          )
        )
        .groupBy(invoiceLineItems.courseId);

      const costByCourse = new Map(
        costRows.filter(c => c.courseId).map(c => [c.courseId as string, c.costPKR])
      );

      return revenueRows
        .map(r => {
          const teacherCostPKR = costByCourse.get(r.courseId) ?? 0;
          const profitPKR = r.revenuePKR - teacherCostPKR;
          return {
            courseId: r.courseId,
            courseTitle: r.courseTitle,
            revenuePKR: r.revenuePKR,
            teacherCostPKR,
            profitPKR,
            marginPercent: r.revenuePKR > 0 ? (profitPKR / r.revenuePKR) * 100 : 0,
            studentCount: r.studentCount,
            revenuePerStudentPKR: r.studentCount > 0 ? r.revenuePKR / r.studentCount : 0,
          };
        })
        .sort((a, b) => b.profitPKR - a.profitPKR);
    } catch (error: any) {
      logger.error('Error getting course profitability', { error: error.message });
      throw new AppError(500, 'Failed to fetch course profitability');
    }
  },

  /**
   * PERFORMANCE ANALYTICS
   */

  /**
   * Assessment score distribution.
   * Conditions are combined into a single where(): chaining where() twice
   * replaces the earlier condition instead of adding to it.
   */
  async getAssessmentDistributions(courseId?: string, assessmentId?: string) {
    try {
      const pct = sql`(${assessmentResults.score}::numeric / NULLIF(${assessments.maxScore}::numeric, 0) * 100)`;
      const bucket = sql`
        CASE
          WHEN ${pct} >= 90 THEN 'A (90-100%)'
          WHEN ${pct} >= 80 THEN 'B (80-89%)'
          WHEN ${pct} >= 70 THEN 'C (70-79%)'
          WHEN ${pct} >= 60 THEN 'D (60-69%)'
          ELSE 'F (0-59%)'
        END
      `;

      const conditions: SQL[] = [];
      if (courseId) conditions.push(eq(assessments.courseId, courseId));
      if (assessmentId) conditions.push(eq(assessmentResults.assessmentId, assessmentId));

      let query = db
        .select({
          scoreRange: sql<string>`${bucket}`,
          count: sql<number>`COUNT(*)::int`,
          avgScore: sql<number>`AVG(${pct})::float`,
        })
        .from(assessmentResults)
        .innerJoin(assessments, eq(assessmentResults.assessmentId, assessments.id))
        .$dynamic();

      if (conditions.length > 0) {
        query = query.where(and(...conditions));
      }

      return await query.groupBy(bucket).orderBy(desc(sql`AVG(${pct})`));
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
          scorePercentage: sql<number>`(${assessmentResults.score}::numeric / NULLIF(${assessments.maxScore}::numeric, 0) * 100)::float`,
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
      const pct = sql`(${assessmentResults.score}::numeric / NULLIF(${assessments.maxScore}::numeric, 0) * 100)`;

      const comparison = await db
        .select({
          courseId: courses.id,
          courseTitle: courses.title,
          avgScore: sql<number>`AVG(${pct})::float`,
          studentCount: sql<number>`COUNT(DISTINCT ${assessmentResults.studentId})::int`,
          assessmentCount: sql<number>`COUNT(DISTINCT ${assessmentResults.assessmentId})::int`,
        })
        .from(courses)
        .leftJoin(assessments, eq(courses.id, assessments.courseId))
        .leftJoin(assessmentResults, eq(assessments.id, assessmentResults.assessmentId))
        .groupBy(courses.id, courses.title)
        .orderBy(desc(sql`AVG(${pct})`));

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
      const pct = sql`(${assessmentResults.score}::numeric / NULLIF(${assessments.maxScore}::numeric, 0) * 100)`;

      let query = db
        .select({
          studentId: users.id,
          firstName: users.firstName,
          lastName: users.lastName,
          email: users.email,
          avgScore: sql<number>`AVG(${pct})::float`,
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
        .orderBy(desc(sql`AVG(${pct})`))
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
      const pct = sql`(${assessmentResults.score}::numeric / NULLIF(${assessments.maxScore}::numeric, 0) * 100)`;

      let query = db
        .select({
          totalAssessments: sql<number>`COUNT(*)::int`,
          passedCount: sql<number>`SUM(CASE WHEN ${pct} >= 60 THEN 1 ELSE 0 END)::int`,
          failedCount: sql<number>`SUM(CASE WHEN ${pct} < 60 THEN 1 ELSE 0 END)::int`,
          passRate: sql<number>`(SUM(CASE WHEN ${pct} >= 60 THEN 1 ELSE 0 END)::float / NULLIF(COUNT(*), 0)::float * 100)::float`,
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
   * Students needing attention: weak attendance, low scores, or unpaid fees.
   * Each signal is gathered separately then combined per student, so the
   * joins cannot inflate one another's counts.
   */
  async getAtRiskStudents(limit: number = 20) {
    try {
      const [attendanceRows, scoreRows, overdueRows, studentRows] = await Promise.all([
        db
          .select({
            studentId: attendanceRecords.studentId,
            sessions: sql<number>`COUNT(*)::int`,
            attendanceRate: sql<number>`(SUM(CASE WHEN ${attendanceRecords.status} IN ('present', 'late') THEN 1 ELSE 0 END)::float / NULLIF(COUNT(*), 0)::float * 100)::float`,
          })
          .from(attendanceRecords)
          .groupBy(attendanceRecords.studentId),

        db
          .select({
            studentId: assessmentResults.studentId,
            avgScore: sql<number>`AVG((${assessmentResults.score}::numeric / NULLIF(${assessments.maxScore}::numeric, 0) * 100))::float`,
            assessmentCount: sql<number>`COUNT(*)::int`,
          })
          .from(assessmentResults)
          .innerJoin(assessments, eq(assessmentResults.assessmentId, assessments.id))
          .groupBy(assessmentResults.studentId),

        db
          .select({
            studentId: fees.studentId,
            overdueCount: sql<number>`COUNT(*)::int`,
            overduePKR: sumInPkr(fees.amount, fees.currency),
          })
          .from(fees)
          .where(sql`${fees.status} IN ('pending', 'overdue') AND ${fees.dueDate} < CURRENT_DATE`)
          .groupBy(fees.studentId),

        db
          .select({
            studentId: users.id,
            firstName: users.firstName,
            lastName: users.lastName,
            email: users.email,
          })
          .from(users)
          .where(eq(users.role, 'student')),
      ]);

      const attendanceBy = new Map(attendanceRows.map(r => [r.studentId, r]));
      const scoreBy = new Map(scoreRows.map(r => [r.studentId, r]));
      const overdueBy = new Map(overdueRows.map(r => [r.studentId, r]));

      const scored = studentRows.map(student => {
        const attendance = attendanceBy.get(student.studentId);
        const score = scoreBy.get(student.studentId);
        const overdue = overdueBy.get(student.studentId);

        const reasons: string[] = [];
        let riskScore = 0;

        if (attendance && attendance.sessions >= 3 && attendance.attendanceRate < 75) {
          riskScore += ((75 - attendance.attendanceRate) / 75) * 40;
          reasons.push(`Attendance ${attendance.attendanceRate.toFixed(0)}%`);
        }
        if (score && score.assessmentCount >= 1 && score.avgScore < 60) {
          riskScore += ((60 - score.avgScore) / 60) * 40;
          reasons.push(`Average score ${score.avgScore.toFixed(0)}%`);
        }
        if (overdue && overdue.overdueCount > 0) {
          riskScore += Math.min(overdue.overdueCount * 10, 20);
          reasons.push(`${overdue.overdueCount} overdue fee${overdue.overdueCount > 1 ? 's' : ''}`);
        }

        return {
          studentId: student.studentId,
          studentName: `${student.firstName} ${student.lastName}`,
          email: student.email,
          attendanceRate: attendance?.attendanceRate ?? null,
          avgScore: score?.avgScore ?? null,
          overdueCount: overdue?.overdueCount ?? 0,
          overduePKR: overdue?.overduePKR ?? 0,
          riskScore: Math.round(riskScore),
          reasons,
        };
      });

      return scored
        .filter(s => s.reasons.length > 0)
        .sort((a, b) => b.riskScore - a.riskScore)
        .slice(0, limit);
    } catch (error: any) {
      logger.error('Error getting at-risk students', { error: error.message });
      throw new AppError(500, 'Failed to fetch at-risk students');
    }
  },

  /**
   * ATTENDANCE ANALYTICS
   */

  /**
   * Attendance trends over time.
   * Conditions are combined into a single where(): previously the date filter
   * replaced the course filter, silently widening the query.
   */
  async getAttendanceTrends(
    courseId?: string,
    startDate?: Date,
    endDate?: Date
  ) {
    try {
      const conditions: SQL[] = [];
      if (courseId) {
        conditions.push(eq(courseEvents.courseId, courseId));
      }
      if (startDate && endDate) {
        conditions.push(gte(courseEvents.eventDate, startDate.toISOString().split('T')[0]));
        conditions.push(lte(courseEvents.eventDate, endDate.toISOString().split('T')[0]));
      }

      let query = db
        .select({
          eventDate: courseEvents.eventDate,
          totalStudents: sql<number>`COUNT(DISTINCT ${attendanceRecords.studentId})::int`,
          presentCount: sql<number>`SUM(CASE WHEN ${attendanceRecords.status} = 'present' THEN 1 ELSE 0 END)::int`,
          lateCount: sql<number>`SUM(CASE WHEN ${attendanceRecords.status} = 'late' THEN 1 ELSE 0 END)::int`,
          absentCount: sql<number>`SUM(CASE WHEN ${attendanceRecords.status} = 'absent' THEN 1 ELSE 0 END)::int`,
          attendanceRate: sql<number>`(SUM(CASE WHEN ${attendanceRecords.status} IN ('present', 'late') THEN 1 ELSE 0 END)::float / NULLIF(COUNT(*), 0)::float * 100)::float`,
        })
        .from(attendanceRecords)
        .innerJoin(courseEvents, eq(attendanceRecords.courseEventId, courseEvents.id))
        .$dynamic();

      if (conditions.length > 0) {
        query = query.where(and(...conditions));
      }

      return await query
        .groupBy(courseEvents.eventDate)
        .orderBy(courseEvents.eventDate);
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
          droppedEnrollments: sql<number>`COUNT(CASE WHEN ${enrollments.status} = 'dropped' THEN 1 END)::int`,
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
   * Retention: how many enrolments are holding, finishing, or being lost.
   */
  async getRetentionMetrics(startDate: Date, endDate: Date) {
    try {
      const [totalsRow] = await db
        .select({
          active: sql<number>`COUNT(CASE WHEN ${enrollments.status} = 'active' THEN 1 END)::int`,
          completed: sql<number>`COUNT(CASE WHEN ${enrollments.status} = 'completed' THEN 1 END)::int`,
          dropped: sql<number>`COUNT(CASE WHEN ${enrollments.status} = 'dropped' THEN 1 END)::int`,
          total: sql<number>`COUNT(*)::int`,
        })
        .from(enrollments);

      const dropTrend = await db
        .select({
          month: sql<string>`TO_CHAR(${enrollments.enrolledAt}, 'YYYY-MM')`,
          dropped: sql<number>`COUNT(CASE WHEN ${enrollments.status} = 'dropped' THEN 1 END)::int`,
          enrolled: sql<number>`COUNT(*)::int`,
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

      const dropByCourse = await db
        .select({
          courseId: courses.id,
          courseTitle: courses.title,
          dropped: sql<number>`COUNT(CASE WHEN ${enrollments.status} = 'dropped' THEN 1 END)::int`,
          total: sql<number>`COUNT(${enrollments.id})::int`,
        })
        .from(courses)
        .leftJoin(enrollments, eq(courses.id, enrollments.courseId))
        .groupBy(courses.id, courses.title)
        .orderBy(desc(sql`COUNT(CASE WHEN ${enrollments.status} = 'dropped' THEN 1 END)`))
        .limit(10);

      // Only enrolments that have actually finished count towards churn -
      // active ones have not had their outcome decided yet.
      const settled = (totalsRow?.completed ?? 0) + (totalsRow?.dropped ?? 0);

      return {
        active: totalsRow?.active ?? 0,
        completed: totalsRow?.completed ?? 0,
        dropped: totalsRow?.dropped ?? 0,
        total: totalsRow?.total ?? 0,
        churnRate: settled > 0 ? ((totalsRow?.dropped ?? 0) / settled) * 100 : 0,
        retentionRate: settled > 0 ? ((totalsRow?.completed ?? 0) / settled) * 100 : 0,
        dropTrend,
        dropByCourse: dropByCourse.filter(c => c.total > 0),
      };
    } catch (error: any) {
      logger.error('Error getting retention metrics', { error: error.message });
      throw new AppError(500, 'Failed to fetch retention metrics');
    }
  },

  /**
   * Lead conversion: enquiries in, students out, and which sources work.
   */
  async getLeadConversion(startDate: Date, endDate: Date) {
    try {
      const [byStatus, bySource, trend] = await Promise.all([
        db
          .select({
            status: leads.status,
            count: sql<number>`COUNT(*)::int`,
          })
          .from(leads)
          .where(and(gte(leads.createdAt, startDate), lte(leads.createdAt, endDate)))
          .groupBy(leads.status)
          .orderBy(desc(sql`COUNT(*)`)),

        db
          .select({
            source: leads.source,
            total: sql<number>`COUNT(*)::int`,
            converted: sql<number>`COUNT(${leads.convertedToStudentId})::int`,
          })
          .from(leads)
          .where(and(gte(leads.createdAt, startDate), lte(leads.createdAt, endDate)))
          .groupBy(leads.source)
          .orderBy(desc(sql`COUNT(*)`)),

        db
          .select({
            month: sql<string>`TO_CHAR(${leads.createdAt}, 'YYYY-MM')`,
            total: sql<number>`COUNT(*)::int`,
            converted: sql<number>`COUNT(${leads.convertedToStudentId})::int`,
          })
          .from(leads)
          .where(and(gte(leads.createdAt, startDate), lte(leads.createdAt, endDate)))
          .groupBy(sql`TO_CHAR(${leads.createdAt}, 'YYYY-MM')`)
          .orderBy(sql`TO_CHAR(${leads.createdAt}, 'YYYY-MM')`),
      ]);

      const totalLeads = byStatus.reduce((s, r) => s + r.count, 0);
      const totalConverted = bySource.reduce((s, r) => s + r.converted, 0);

      return {
        totalLeads,
        totalConverted,
        conversionRate: totalLeads > 0 ? (totalConverted / totalLeads) * 100 : 0,
        byStatus,
        bySource: bySource.map(s => ({
          ...s,
          conversionRate: s.total > 0 ? (s.converted / s.total) * 100 : 0,
        })),
        trend,
      };
    } catch (error: any) {
      logger.error('Error getting lead conversion', { error: error.message });
      throw new AppError(500, 'Failed to fetch lead conversion analytics');
    }
  },

  /**
   * Teacher workload.
   * Class and student counts come from separate queries: joining events to
   * enrolments multiplies the rows, which previously inflated the class count
   * by roughly the number of students in each course.
   */
  async getTeacherWorkload() {
    try {
      const [classRows, studentRows, teachers] = await Promise.all([
        db
          .select({
            teacherId: courseEvents.teacherId,
            courseCount: sql<number>`COUNT(DISTINCT ${courseEvents.courseId})::int`,
            totalClasses: sql<number>`COUNT(${courseEvents.id})::int`,
          })
          .from(courseEvents)
          .groupBy(courseEvents.teacherId),

        db
          .select({
            teacherId: courseEvents.teacherId,
            studentCount: sql<number>`COUNT(DISTINCT ${enrollments.studentId})::int`,
          })
          .from(courseEvents)
          .innerJoin(enrollments, eq(courseEvents.courseId, enrollments.courseId))
          .where(eq(enrollments.status, 'active'))
          .groupBy(courseEvents.teacherId),

        db
          .select({
            teacherId: users.id,
            teacherName: sql<string>`CONCAT(${users.firstName}, ' ', ${users.lastName})`,
            email: users.email,
          })
          .from(users)
          .where(eq(users.role, 'teacher')),
      ]);

      const classesBy = new Map(
        classRows.filter(r => r.teacherId).map(r => [r.teacherId as string, r])
      );
      const studentsBy = new Map(
        studentRows.filter(r => r.teacherId).map(r => [r.teacherId as string, r])
      );

      return teachers
        .map(t => ({
          teacherId: t.teacherId,
          teacherName: t.teacherName,
          email: t.email,
          courseCount: classesBy.get(t.teacherId)?.courseCount ?? 0,
          totalClasses: classesBy.get(t.teacherId)?.totalClasses ?? 0,
          studentCount: studentsBy.get(t.teacherId)?.studentCount ?? 0,
        }))
        .sort((a, b) => b.totalClasses - a.totalClasses);
    } catch (error: any) {
      logger.error('Error getting teacher workload', { error: error.message });
      throw new AppError(500, 'Failed to fetch teacher workload analytics');
    }
  },
};

export default analyticsService;

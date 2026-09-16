import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { analyticsService } from '../services/analytics.service';
import logger from '../utils/logger';

// Validation schemas
const analyticsQuerySchema = z.object({
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  courseId: z.string().uuid().optional(),
  assessmentId: z.string().uuid().optional(),
  teacherId: z.string().uuid().optional(),
  studentId: z.string().uuid().optional(),
  groupBy: z.enum(['day', 'week', 'month']).optional(),
  limit: z.string().regex(/^\d+$/).optional(),
});

/**
 * Resolves the requested period and the equally long period immediately before
 * it, so every figure can be shown against a like-for-like comparison.
 */
function resolveDateRange(startDate?: string, endDate?: string) {
  const end = endDate ? new Date(endDate) : new Date();
  const start = startDate
    ? new Date(startDate)
    : new Date(end.getFullYear(), 0, 1);

  const spanMs = Math.max(end.getTime() - start.getTime(), 0);
  const previousEnd = new Date(start.getTime() - 1);
  const previousStart = new Date(previousEnd.getTime() - spanMs);

  return { start, end, previousStart, previousEnd };
}

/** Percentage change from a previous value, guarding against division by zero. */
function percentChange(current: number, previous: number): number | null {
  if (previous === 0) return current === 0 ? 0 : null;
  return ((current - previous) / previous) * 100;
}

// Financial Analytics
export const getFinancialAnalytics = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const validated = analyticsQuerySchema.parse(req.query);

    logger.info('Fetching financial analytics', {
      userId: req.user?.id,
      filters: validated
    });

    const { start, end, previousStart, previousEnd } = resolveDateRange(
      validated.startDate,
      validated.endDate
    );

    const [
      revenueOverTime,
      paymentMethods,
      outstandingFees,
      courseRevenue,
      collectionRate,
      courseProfitability,
      previousRevenue,
      previousCollection,
    ] = await Promise.all([
      analyticsService.getRevenueOverTime(
        start,
        end,
        validated.groupBy as 'day' | 'week' | 'month' | undefined
      ),
      analyticsService.getPaymentMethodBreakdown(start, end),
      analyticsService.getOutstandingFeesAnalysis(),
      analyticsService.getCourseRevenueBreakdown(start, end),
      analyticsService.getCollectionRate(start, end),
      analyticsService.getCourseProfitability(start, end),
      analyticsService.getRevenueOverTime(previousStart, previousEnd, 'month'),
      analyticsService.getCollectionRate(previousStart, previousEnd),
    ]);

    const totalRevenuePKR = revenueOverTime.reduce((s, r) => s + r.revenuePKR, 0);
    const previousRevenuePKR = previousRevenue.reduce((s, r) => s + r.revenuePKR, 0);
    const totalProfitPKR = courseProfitability.reduce((s, c) => s + c.profitPKR, 0);
    const totalTeacherCostPKR = courseProfitability.reduce((s, c) => s + c.teacherCostPKR, 0);

    res.json({
      revenueOverTime,
      paymentMethods,
      outstandingFees,
      courseRevenue,
      collectionRate,
      courseProfitability,
      totals: {
        revenuePKR: totalRevenuePKR,
        teacherCostPKR: totalTeacherCostPKR,
        profitPKR: totalProfitPKR,
        transactionCount: revenueOverTime.reduce((s, r) => s + r.transactionCount, 0),
      },
      comparison: {
        period: {
          start: start.toISOString().split('T')[0],
          end: end.toISOString().split('T')[0],
        },
        previousPeriod: {
          start: previousStart.toISOString().split('T')[0],
          end: previousEnd.toISOString().split('T')[0],
        },
        revenuePKR: {
          current: totalRevenuePKR,
          previous: previousRevenuePKR,
          changePercent: percentChange(totalRevenuePKR, previousRevenuePKR),
        },
        collectionRate: {
          current: collectionRate.collectionRate,
          previous: previousCollection.collectionRate,
          changePercent: percentChange(
            collectionRate.collectionRate,
            previousCollection.collectionRate
          ),
        },
      },
    });
  } catch (error) {
    next(error);
  }
};

// Performance Analytics
export const getPerformanceAnalytics = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const validated = analyticsQuerySchema.parse(req.query);

    // If user is a teacher, filter to their courses only
    let courseIdFilter = validated.courseId;
    if (req.user?.role === 'teacher') {
      // Teachers can only view analytics for their own courses
      // If courseId is provided, we'll validate it belongs to them in the service
      logger.info('Teacher accessing performance analytics', {
        teacherId: req.user.id,
        requestedCourseId: courseIdFilter
      });
    }

    logger.info('Fetching performance analytics', {
      userId: req.user?.id,
      filters: validated
    });

    const [
      assessmentDistributions,
      coursePerformanceComparison,
      topPerformers,
      passFailRates,
      atRiskStudents,
    ] = await Promise.all([
      analyticsService.getAssessmentDistributions(
        courseIdFilter,
        validated.assessmentId
      ),
      analyticsService.getCoursePerformanceComparison(),
      analyticsService.getTopPerformers(
        courseIdFilter,
        validated.limit ? parseInt(validated.limit) : undefined
      ),
      analyticsService.getPassFailRates(courseIdFilter),
      analyticsService.getAtRiskStudents(
        validated.limit ? parseInt(validated.limit) : undefined
      ),
    ]);

    // Student trends (if studentId is provided)
    let studentPerformanceTrends = null;
    if (validated.studentId) {
      studentPerformanceTrends = await analyticsService.getStudentPerformanceTrends(
        validated.studentId
      );
    }

    res.json({
      assessmentDistributions,
      coursePerformanceComparison,
      topPerformers,
      passFailRates,
      atRiskStudents,
      studentPerformanceTrends,
    });
  } catch (error) {
    next(error);
  }
};

// Attendance Analytics
export const getAttendanceAnalytics = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const validated = analyticsQuerySchema.parse(req.query);

    // If user is a teacher, filter to their courses only
    let courseIdFilter = validated.courseId;
    if (req.user?.role === 'teacher') {
      logger.info('Teacher accessing attendance analytics', {
        teacherId: req.user.id,
        requestedCourseId: courseIdFilter
      });
    }

    logger.info('Fetching attendance analytics', {
      userId: req.user?.id,
      filters: validated
    });

    // Convert string dates to Date objects for attendance trends
    const startDate = validated.startDate ? new Date(validated.startDate) : undefined;
    const endDate = validated.endDate ? new Date(validated.endDate) : undefined;

    const [
      attendanceTrends,
      attendanceByStatus,
    ] = await Promise.all([
      analyticsService.getAttendanceTrends(
        courseIdFilter,
        startDate,
        endDate
      ),
      analyticsService.getAttendanceByStatus(courseIdFilter),
    ]);

    res.json({
      attendanceTrends,
      attendanceByStatus,
    });
  } catch (error) {
    next(error);
  }
};

// Course Analytics
export const getCourseAnalytics = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const validated = analyticsQuerySchema.parse(req.query);

    logger.info('Fetching course analytics', {
      userId: req.user?.id,
      filters: validated
    });

    const { start, end } = resolveDateRange(validated.startDate, validated.endDate);

    const [
      coursePopularity,
      enrollmentTrends,
      retention,
    ] = await Promise.all([
      analyticsService.getCoursePopularity(),
      analyticsService.getEnrollmentTrends(start, end),
      analyticsService.getRetentionMetrics(start, end),
    ]);

    res.json({
      coursePopularity,
      enrollmentTrends,
      retention,
    });
  } catch (error) {
    next(error);
  }
};

// Growth Analytics - lead conversion and retention (Admin only)
export const getGrowthAnalytics = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const validated = analyticsQuerySchema.parse(req.query);

    logger.info('Fetching growth analytics', {
      userId: req.user?.id,
      filters: validated
    });

    const { start, end, previousStart, previousEnd } = resolveDateRange(
      validated.startDate,
      validated.endDate
    );

    const [leadConversion, retention, previousLeads] = await Promise.all([
      analyticsService.getLeadConversion(start, end),
      analyticsService.getRetentionMetrics(start, end),
      analyticsService.getLeadConversion(previousStart, previousEnd),
    ]);

    res.json({
      leadConversion,
      retention,
      comparison: {
        previousPeriod: {
          start: previousStart.toISOString().split('T')[0],
          end: previousEnd.toISOString().split('T')[0],
        },
        totalLeads: {
          current: leadConversion.totalLeads,
          previous: previousLeads.totalLeads,
          changePercent: percentChange(leadConversion.totalLeads, previousLeads.totalLeads),
        },
        conversionRate: {
          current: leadConversion.conversionRate,
          previous: previousLeads.conversionRate,
          changePercent: percentChange(
            leadConversion.conversionRate,
            previousLeads.conversionRate
          ),
        },
      },
    });
  } catch (error) {
    next(error);
  }
};

// Teacher Analytics
export const getTeacherAnalytics = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const validated = analyticsQuerySchema.parse(req.query);

    logger.info('Fetching teacher analytics', {
      userId: req.user?.id,
      filters: validated
    });

    const teacherWorkload = await analyticsService.getTeacherWorkload();

    res.json({
      teacherWorkload,
    });
  } catch (error) {
    next(error);
  }
};

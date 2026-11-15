import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import * as campusMerge from '../services/analyticsCampus';
import { campusServices, forCampuses } from '../services/analyticsCampus';
import logger from '../utils/logger';
import { AppError } from '../middleware/errorHandler';
import { juniorDb } from '../config/database';
import { classProfitService } from '../services/classProfit.service';
import { otherCampus, isJuniorInstance, ownCampusLabel } from '../services/otherCampus.service';

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
  campus: z.enum(['senior', 'junior', 'both']).optional(),
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

    const {
      revenueOverTime,
      paymentMethods,
      outstandingFees,
      courseRevenue,
      collectionRate,
      courseProfitability,
      teacherProfitability,
      previousRevenue,
      previousCollection,
    } = await forCampuses(
      campusServices(req),
      async (svc) => {
        const [r, pm, of, cr, col, prof, prevR, prevC] = await Promise.all([
          svc.getRevenueOverTime(start, end, validated.groupBy as 'day' | 'week' | 'month' | undefined),
          svc.getPaymentMethodBreakdown(start, end),
          svc.getOutstandingFeesAnalysis(),
          svc.getCourseRevenueBreakdown(start, end),
          svc.getCollectionRate(start, end),
          svc.getProfitability(start, end),
          svc.getRevenueOverTime(previousStart, previousEnd, 'month'),
          svc.getCollectionRate(previousStart, previousEnd),
        ]);
        return {
          revenueOverTime: r,
          paymentMethods: pm,
          outstandingFees: of,
          courseRevenue: cr,
          collectionRate: col,
          courseProfitability: prof.courses,
          teacherProfitability: prof.teachers,
          previousRevenue: prevR,
          previousCollection: prevC,
        };
      },
      (a, b) => ({
        revenueOverTime: campusMerge.mergeRevenue(a.revenueOverTime, b.revenueOverTime),
        paymentMethods: campusMerge.mergeMethods(a.paymentMethods, b.paymentMethods),
        outstandingFees: campusMerge.mergeOutstanding(a.outstandingFees, b.outstandingFees),
        courseRevenue: campusMerge.mergeCourseRevenue(a.courseRevenue, b.courseRevenue),
        collectionRate: campusMerge.mergeCollection(a.collectionRate, b.collectionRate),
        courseProfitability: campusMerge.mergeProfitability(a.courseProfitability, b.courseProfitability),
        teacherProfitability: campusMerge.mergeTeacherProfitability(a.teacherProfitability, b.teacherProfitability),
        previousRevenue: campusMerge.mergeRevenue(a.previousRevenue, b.previousRevenue),
        previousCollection: campusMerge.mergeCollection(a.previousCollection, b.previousCollection),
      })
    );

    // Money that arrived in the period (by payment date): the revenue-over-time chart and its trend
    const collectedPKR = revenueOverTime.reduce((s, r) => s + r.revenuePKR, 0);
    const previousCollectedPKR = previousRevenue.reduce((s, r) => s + r.revenuePKR, 0);

    // Headline figures on the same basis as the profitability tables (fees by the month they
    // are for): revenue = invoiced + not invoiced, invoiced = paid + not received
    const sumOf = (pick: (c: (typeof courseProfitability)[number]) => number) => courseProfitability.reduce((s, c) => s + pick(c), 0);
    const totalRevenuePKR = sumOf(c => c.revenuePKR);
    const totalPaidPKR = sumOf(c => c.paidPKR);
    // Every teacher's pay in the period, also staff who teach no class
    const totalTeacherCostPKR = teacherProfitability.reduce((s, t) => s + t.teacherCostPKR, 0);

    res.json({
      revenueOverTime,
      paymentMethods,
      outstandingFees,
      courseRevenue,
      collectionRate,
      courseProfitability,
      teacherProfitability,
      totals: {
        revenuePKR: totalRevenuePKR,
        invoicedPKR: sumOf(c => c.invoicedPKR),
        notInvoicedPKR: sumOf(c => c.notInvoicedPKR),
        paidPKR: totalPaidPKR,
        notReceivedPKR: sumOf(c => c.notReceivedPKR),
        teacherCostPKR: totalTeacherCostPKR,
        estimatedCostPKR: teacherProfitability.reduce((s, t) => s + t.estimatedCostPKR, 0),
        profitPKR: totalRevenuePKR - totalTeacherCostPKR, // expected profit
        profitSoFarPKR: totalPaidPKR - totalTeacherCostPKR,
        collectedPKR,
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
          current: collectedPKR,
          previous: previousCollectedPKR,
          changePercent: percentChange(collectedPKR, previousCollectedPKR),
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

    const limit = validated.limit ? parseInt(validated.limit) : undefined;
    const {
      assessmentDistributions,
      coursePerformanceComparison,
      topPerformers,
      passFailRates,
      atRiskStudents,
      studentPerformanceTrends,
    } = await forCampuses(
      campusServices(req),
      async (svc) => {
        const [ad, cpc, tp, pf, ar] = await Promise.all([
          svc.getAssessmentDistributions(courseIdFilter, validated.assessmentId),
          svc.getCoursePerformanceComparison(),
          svc.getTopPerformers(courseIdFilter, limit),
          svc.getPassFailRates(courseIdFilter),
          svc.getAtRiskStudents(limit),
        ]);
        // Student trends (if studentId is provided)
        const st = validated.studentId ? await svc.getStudentPerformanceTrends(validated.studentId) : null;
        return {
          assessmentDistributions: ad,
          coursePerformanceComparison: cpc,
          topPerformers: tp,
          passFailRates: pf,
          atRiskStudents: ar,
          studentPerformanceTrends: st,
        };
      },
      (a, b) => ({
        assessmentDistributions: campusMerge.mergeDistributions(a.assessmentDistributions, b.assessmentDistributions),
        coursePerformanceComparison: campusMerge.mergeCoursePerformance(a.coursePerformanceComparison, b.coursePerformanceComparison),
        topPerformers: campusMerge.mergeTopPerformers(a.topPerformers, b.topPerformers, limit ?? 10),
        passFailRates: campusMerge.mergePassFail(a.passFailRates, b.passFailRates),
        atRiskStudents: campusMerge.mergeAtRisk(a.atRiskStudents, b.atRiskStudents, limit ?? 20),
        studentPerformanceTrends: campusMerge.mergeStudentTrends(a.studentPerformanceTrends, b.studentPerformanceTrends),
      })
    );

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

    const { attendanceTrends, attendanceByStatus } = await forCampuses(
      campusServices(req),
      async (svc) => {
        const [trends, byStatus] = await Promise.all([
          svc.getAttendanceTrends(courseIdFilter, startDate, endDate),
          svc.getAttendanceByStatus(courseIdFilter),
        ]);
        return { attendanceTrends: trends, attendanceByStatus: byStatus };
      },
      (a, b) => ({
        attendanceTrends: campusMerge.mergeAttendanceTrends(a.attendanceTrends, b.attendanceTrends),
        attendanceByStatus: campusMerge.mergeAttendanceByStatus(a.attendanceByStatus, b.attendanceByStatus),
      })
    );

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

    const { coursePopularity, enrollmentTrends, retention } = await forCampuses(
      campusServices(req),
      async (svc) => {
        const [popularity, trends, ret] = await Promise.all([
          svc.getCoursePopularity(),
          svc.getEnrollmentTrends(start, end),
          svc.getRetentionMetrics(start, end),
        ]);
        return { coursePopularity: popularity, enrollmentTrends: trends, retention: ret };
      },
      (a, b) => ({
        coursePopularity: campusMerge.mergePopularity(a.coursePopularity, b.coursePopularity),
        enrollmentTrends: campusMerge.mergeEnrollmentTrends(a.enrollmentTrends, b.enrollmentTrends),
        retention: campusMerge.mergeRetention(a.retention, b.retention),
      })
    );

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

    const { leadConversion, retention, previousLeads } = await forCampuses(
      campusServices(req),
      async (svc) => {
        const [leads, ret, prevLeads] = await Promise.all([
          svc.getLeadConversion(start, end),
          svc.getRetentionMetrics(start, end),
          svc.getLeadConversion(previousStart, previousEnd),
        ]);
        return { leadConversion: leads, retention: ret, previousLeads: prevLeads };
      },
      (a, b) => ({
        leadConversion: campusMerge.mergeLeads(a.leadConversion, b.leadConversion),
        retention: campusMerge.mergeRetention(a.retention, b.retention),
        previousLeads: campusMerge.mergeLeads(a.previousLeads, b.previousLeads),
      })
    );

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

    const teacherWorkload = await forCampuses(
      campusServices(req),
      (svc) => svc.getTeacherWorkload(),
      campusMerge.mergeWorkload
    );

    res.json({
      teacherWorkload,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/analytics/profitability?startDate=&endDate=&campus= (admins and sudo)
 * Course and teacher profitability for a period: the Financial tab's month filter asks for
 * one month at a time (first to last day of the month).
 */
export const getProfitability = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const validated = analyticsQuerySchema.parse(req.query);
    const { start, end } = resolveDateRange(validated.startDate, validated.endDate);
    const result = await forCampuses(
      campusServices(req),
      (svc) => svc.getProfitability(start, end),
      (a, b) => ({
        courses: campusMerge.mergeProfitability(a.courses, b.courses),
        teachers: campusMerge.mergeTeacherProfitability(a.teachers, b.teachers),
      })
    );
    res.json({ courseProfitability: result.courses, teacherProfitability: result.teachers });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/analytics/profitability/fees?startDate=&endDate=&group=&teacherId=&campus=
 * The fees behind a class's (courseId) or a teacher's (teacherId) Received / Not received /
 * Not invoiced figure (admins and sudo;
 * the Junior Campus from the Senior portal is sudo only). teacherId "none" = classes with no
 * teacher assigned.
 */
export const getProfitabilityFees = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const query = z.object({
      startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      group: z.enum(['received', 'notReceived', 'notInvoiced']),
      teacherId: z.string().uuid().or(z.literal('none')).optional(),
      courseId: z.string().uuid().optional(),
      campus: z.enum(['senior', 'junior']).default('senior'),
    }).safeParse(req.query);
    if (!query.success || (!query.data.teacherId && !query.data.courseId)) throw new AppError(400, 'Invalid request');
    const { startDate, endDate, group, teacherId, courseId, campus } = query.data;
    const { start, end } = resolveDateRange(startDate, endDate);
    const filter = { startDate: start, endDate: end, group, courseId, teacherId: teacherId === 'none' ? null : teacherId };

    if (campus === 'junior') {
      if (req.user?.role !== 'sudo') throw new AppError(403, 'Only sudo can view other campuses');
      if (!juniorDb) throw new AppError(400, 'Junior Campus is not connected to this portal');
      const fees = await classProfitService.getFeeList(filter, juniorDb);
      return res.json({ fees: fees.map((fee) => ({ ...fee, campus: 'junior' as const })) });
    }
    res.json({ fees: await classProfitService.getFeeList(filter) });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/analytics/profitability/class-breakdown?startDate=&endDate=&courseId=&campus=
 * One class of Course profitability, student by student (admins and sudo; a Junior Campus
 * class from the Senior portal is sudo only and is worked out by the Junior backend).
 */
export const getClassBreakdown = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const query = z.object({
      startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      courseId: z.string().uuid(),
      campus: z.enum(['senior', 'junior']).default('senior'),
    }).safeParse(req.query);
    if (!query.success) throw new AppError(400, 'Invalid request');
    const { startDate, endDate, courseId, campus } = query.data;
    const { start, end } = resolveDateRange(startDate, endDate);

    if (campus === 'junior') {
      if (req.user?.role !== 'sudo') throw new AppError(403, 'Only sudo can view other campuses');
      const students = await otherCampus.classBreakdown(courseId, start, end);
      return res.json({ students: students.map((student) => ({ ...student, campus: 'junior' as const })) });
    }
    res.json({ students: await classProfitService.getClassBreakdown(courseId, start, end) });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/analytics/class-profit?month=&year=&campus= (sudo only)
 * For each class in a month: fees due and received, what its teacher is paid, and the profit.
 * The other campus is asked through its own backend, since pay rules belong to each portal.
 */
export const getClassProfit = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const [nowYear, nowMonth] = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Karachi' }).format(new Date()).split('-').map(Number);
    const { month, year, campus } = z.object({
      month: z.coerce.number().int().min(1).max(12).default(nowMonth),
      year: z.coerce.number().int().min(2020).max(2100).default(nowYear),
      campus: z.enum(['senior', 'junior', 'both']).default('senior'),
    }).parse(req.query);

    // 'senior' is this portal's own report. The campus switch is a Senior portal feature: on the
    // Junior portal the other campus is Senior, and its classes would be labelled as junior.
    if (campus !== 'senior' && isJuniorInstance) throw new AppError(403, `This portal shows the ${ownCampusLabel} only`);
    if (campus === 'senior') return res.json(await classProfitService.getReport(month, year));

    const other = await otherCampus.classProfit(month, year);
    const tag = <T>(rows: T[], which: 'senior' | 'junior') => rows.map((row) => ({ ...row, campus: which }));
    const junior = { ...other, classes: tag(other.classes, 'junior'), teachers: tag(other.teachers, 'junior') };
    if (campus === 'junior') return res.json(junior);

    const own = await classProfitService.getReport(month, year);
    res.json({
      month,
      year,
      classes: [...tag(own.classes, 'senior'), ...junior.classes].sort((a, b) => b.expectedProfitPKR - a.expectedProfitPKR),
      teachers: [...tag(own.teachers, 'senior'), ...junior.teachers],
    });
  } catch (error) {
    next(error);
  }
};

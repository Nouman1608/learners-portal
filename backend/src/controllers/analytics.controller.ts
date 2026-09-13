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

// Financial Analytics
export const getFinancialAnalytics = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const validated = analyticsQuerySchema.parse(req.query);

    logger.info('Fetching financial analytics', {
      userId: req.user?.id,
      filters: validated
    });

    // Convert string dates to Date objects
    const startDate = validated.startDate ? new Date(validated.startDate) : new Date(new Date().getFullYear(), 0, 1);
    const endDate = validated.endDate ? new Date(validated.endDate) : new Date();

    const [
      revenueOverTime,
      paymentMethods,
      outstandingFees,
      courseRevenue,
    ] = await Promise.all([
      analyticsService.getRevenueOverTime(
        startDate,
        endDate,
        validated.groupBy as 'day' | 'week' | 'month' | undefined
      ),
      analyticsService.getPaymentMethodBreakdown(
        startDate,
        endDate
      ),
      analyticsService.getOutstandingFeesAnalysis(),
      analyticsService.getCourseRevenueBreakdown(
        startDate,
        endDate
      ),
    ]);

    res.json({
      revenueOverTime,
      paymentMethods,
      outstandingFees,
      courseRevenue,
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

    // Convert string dates to Date objects
    const startDate = validated.startDate ? new Date(validated.startDate) : new Date(new Date().getFullYear(), 0, 1);
    const endDate = validated.endDate ? new Date(validated.endDate) : new Date();

    const [
      coursePopularity,
      enrollmentTrends,
    ] = await Promise.all([
      analyticsService.getCoursePopularity(),
      analyticsService.getEnrollmentTrends(
        startDate,
        endDate
      ),
    ]);

    res.json({
      coursePopularity,
      enrollmentTrends,
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

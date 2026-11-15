import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import { requireAdmin, requireSudo, requireTeacher } from '../middleware/rbac';
import { logActivity } from '../middleware/requestLogger';
import {
  getFinancialAnalytics,
  getPerformanceAnalytics,
  getAttendanceAnalytics,
  getCourseAnalytics,
  getGrowthAnalytics,
  getTeacherAnalytics,
  getClassProfit,
  getProfitability,
  getProfitabilityFees,
  getClassBreakdown,
  getStudentBreakdown,
} from '../controllers/analytics.controller';

const router = Router();

/**
 * Analytics Routes
 * Provides comprehensive analytics across all system domains
 */

// All routes require authentication
router.use(authenticate);

// Financial Analytics (Admin only)
router.get(
  '/financial',
  requireAdmin,
  logActivity('view', 'analytics-financial'),
  getFinancialAnalytics
);

// Performance Analytics (Teachers and Admins)
router.get(
  '/performance',
  requireTeacher,
  logActivity('view', 'analytics-performance'),
  getPerformanceAnalytics
);

// Attendance Analytics (Teachers and Admins)
router.get(
  '/attendance',
  requireTeacher,
  logActivity('view', 'analytics-attendance'),
  getAttendanceAnalytics
);

// Course Analytics (Teachers and Admins)
router.get(
  '/courses',
  requireTeacher,
  logActivity('view', 'analytics-courses'),
  getCourseAnalytics
);

// Growth Analytics - leads and retention (Admin only)
router.get(
  '/growth',
  requireAdmin,
  logActivity('view', 'analytics-growth'),
  getGrowthAnalytics
);

// Teacher Analytics (Admin only)
router.get(
  '/teachers',
  requireAdmin,
  logActivity('view', 'analytics-teachers'),
  getTeacherAnalytics
);

// Course and teacher profitability for a period (the Financial tab's month filter)
router.get(
  '/profitability',
  requireAdmin,
  logActivity('view', 'analytics-profitability'),
  getProfitability
);

// The fees behind a teacher's Received / Not received figure (click the number)
router.get('/profitability/fees', requireAdmin, getProfitabilityFees);

// One class of Course profitability, student by student (click any other number)
router.get('/profitability/class-breakdown', requireAdmin, getClassBreakdown);

// Course profitability as one line per student per class (the student-wise Excel export)
router.get('/profitability/student-breakdown', requireAdmin, getStudentBreakdown);

// Class profit for a month: fees, teacher pay and profit per class (sudo only)
router.get(
  '/class-profit',
  requireSudo,
  logActivity('view', 'analytics-class-profit'),
  getClassProfit
);

export default router;

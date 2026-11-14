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

// Class profit for a month: fees, teacher pay and profit per class (sudo only)
router.get(
  '/class-profit',
  requireSudo,
  logActivity('view', 'analytics-class-profit'),
  getClassProfit
);

export default router;

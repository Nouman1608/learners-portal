import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import { requireStudent } from '../middleware/rbac';
import { logActivity } from '../middleware/requestLogger';
import {
  getStudentOverview,
  getAcademicPerformance,
  getAttendanceHistory,
  getFeesHistory,
} from '../controllers/student-portal.controller';

const router = Router();

/**
 * Student Portal Routes
 * Provides consolidated student data for parent view
 */

// All routes require authentication
router.use(authenticate);

// Student overview (accessible by student, teachers, and admins)
router.get(
  '/:studentId/overview',
  requireStudent,
  logActivity('view', 'student-overview'),
  getStudentOverview
);

// Academic performance
router.get(
  '/:studentId/academic',
  requireStudent,
  logActivity('view', 'student-academic'),
  getAcademicPerformance
);

// Attendance history
router.get(
  '/:studentId/attendance',
  requireStudent,
  logActivity('view', 'student-attendance'),
  getAttendanceHistory
);

// Fees history
router.get(
  '/:studentId/fees',
  requireStudent,
  logActivity('view', 'student-fees'),
  getFeesHistory
);

export default router;

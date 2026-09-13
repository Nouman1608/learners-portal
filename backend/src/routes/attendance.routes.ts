import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import { requireTeacher, requireAdmin, requireStudent } from '../middleware/rbac';
import { logActivity } from '../middleware/requestLogger';
import {
  syncAttendance,
  getEventAttendance,
  getStudentAttendance,
  getCourseAttendanceStats,
  getSyncLogs,
  getStudentAttendanceRate,
  markManualAttendance,
  getStudentsByMode,
} from '../controllers/attendance.controller';

const router = Router();

/**
 * Attendance Routes
 * Handles Microsoft Teams attendance syncing and viewing
 */

// All routes require authentication
router.use(authenticate);

// Sync attendance (teachers only)
router.post(
  '/events/:eventId/sync',
  requireTeacher,
  logActivity('sync-attendance', 'attendance'),
  syncAttendance
);

// Mark manual attendance (teachers only)
router.post(
  '/events/:eventId/manual',
  requireTeacher,
  logActivity('mark-manual-attendance', 'attendance'),
  markManualAttendance
);

// Get students grouped by attendance mode (teachers only)
router.get('/events/:eventId/students-by-mode', requireTeacher, getStudentsByMode);

// View attendance (read-only)
router.get('/events/:eventId', requireTeacher, getEventAttendance);

router.get('/students/:studentId', requireStudent, getStudentAttendance);

router.get(
  '/students/:studentId/courses/:courseId/rate',
  requireStudent,
  getStudentAttendanceRate
);

router.get('/courses/:courseId/stats', requireTeacher, getCourseAttendanceStats);

// Sync logs (admin only)
router.get('/sync-logs', requireAdmin, getSyncLogs);

export default router;

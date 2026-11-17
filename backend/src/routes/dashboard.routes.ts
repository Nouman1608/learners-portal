import { Router } from 'express';
import * as dashboardController from '../controllers/dashboard.controller';
import { authenticate } from '../middleware/auth';
import { requireAdmin } from '../middleware/rbac';

const router = Router();

// All routes require authentication
router.use(authenticate);

// Get dashboard stats (role-based)
router.get('/stats', dashboardController.getStats);

// One month's fees at a glance, overall and per teacher's class (admins and sudo)
router.get('/fee-overview', requireAdmin, dashboardController.getFeeOverview);
// The students behind one number of that overview
router.get('/fee-overview/students', requireAdmin, dashboardController.getFeeOverviewStudents);

// Printable monthly attendance sheets, one per class (admins and sudo)
router.get('/attendance-sheet', requireAdmin, dashboardController.getAttendanceSheet);

export default router;

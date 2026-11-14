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

export default router;

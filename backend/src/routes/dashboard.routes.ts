import { Router } from 'express';
import * as dashboardController from '../controllers/dashboard.controller';
import { authenticate } from '../middleware/auth';

const router = Router();

// All routes require authentication
router.use(authenticate);

// Get dashboard stats (role-based)
router.get('/stats', dashboardController.getStats);

export default router;

import { Router } from 'express';
import * as logsController from '../controllers/logs.controller';
import { authenticate } from '../middleware/auth';
import { requireSudo } from '../middleware/rbac';

const router = Router();

// All routes require sudo authentication
router.use(authenticate);
router.use(requireSudo);

// Get activity logs with filters and pagination
router.get('/', logsController.getLogs);

// Get log by ID
router.get('/:id', logsController.getLogById);

// Get unique actions (for filter dropdown)
router.get('/meta/actions', logsController.getUniqueActions);

// Get unique resources (for filter dropdown)
router.get('/meta/resources', logsController.getUniqueResources);

// Get activity stats
router.get('/stats/overview', logsController.getStats);

export default router;

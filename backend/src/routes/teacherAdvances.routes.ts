import { Router } from 'express';
import * as advancesController from '../controllers/teacherAdvances.controller';
import { authenticate } from '../middleware/auth';
import { requireAdmin, requireTeacher } from '../middleware/rbac';
import { logActivity } from '../middleware/requestLogger';

const router = Router();

// Teachers see their own salary advances; admins record and delete them
router.use(authenticate);

router.get('/', requireTeacher, advancesController.listAdvances);
router.post('/', requireAdmin, logActivity('create', 'salary-advance'), advancesController.createAdvance);
router.delete('/:id', requireAdmin, logActivity('delete', 'salary-advance'), advancesController.deleteAdvance);

export default router;

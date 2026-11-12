import { Router } from 'express';
import * as controller from '../controllers/teacherAttendance.controller';
import { authenticate } from '../middleware/auth';
import { requireAdmin, requireTeacher } from '../middleware/rbac';
import { logActivity } from '../middleware/requestLogger';

const router = Router();

// Teacher absences / lates per month (Junior portal): admins enter totals, teachers see their own
router.use(authenticate);

router.get('/', requireTeacher, controller.listMonth);
router.put('/', requireAdmin, logActivity('update', 'teacher-attendance'), controller.saveMonth);

export default router;
